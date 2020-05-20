import { service, inject } from 'spryly';
import { Server } from '@hapi/hapi';
import { ConfigService } from './config';
import { StorageService } from './storage';
import { HealthState } from './health';
import { AmsGraph } from './amsGraph';
import { AmsDeviceTag, AmsDeviceTagValue, AmsCameraDevice } from './device';
import { AmsMotionDetectorDevice } from './motionDetectorDevice';
import { AmsObjectDetectorDevice } from './objectDetectorDevice';
import { Mqtt } from 'azure-iot-device-mqtt';
import { SymmetricKeySecurityClient } from 'azure-iot-security-symmetric-key';
import { ProvisioningDeviceClient } from 'azure-iot-provisioning-device';
import { Mqtt as ProvisioningTransport } from 'azure-iot-provisioning-device-mqtt';
import {
    ModuleClient,
    Twin,
    Message as IoTMessage,
    DeviceMethodRequest,
    DeviceMethodResponse
} from 'azure-iot-device';
import {
    arch as osArch,
    platform as osPlatform,
    release as osRelease,
    cpus as osCpus,
    totalmem as osTotalMem,
    freemem as osFreeMem,
    loadavg as osLoadAvg
} from 'os';
import * as crypto from 'crypto';
import * as Wreck from '@hapi/wreck';
import { bind, defer, emptyObj, forget } from '../utils';

type DeviceOperation = 'DELETE_CAMERA' | 'SEND_EVENT' | 'SEND_INFERENCES';

export interface ICameraDeviceProvisionInfo {
    cameraId: string;
    cameraName: string;
    rtspUrl: string;
    rtspAuthUsername: string;
    rtspAuthPassword: string;
    detectionType: AddCameraDetectionType;
}

interface ICameraOperationInfo {
    cameraId: string;
    operationInfo: any;
}

interface IProvisionResult {
    dpsProvisionStatus: boolean;
    dpsProvisionMessage: string;
    dpsHubConnectionString: string;
    clientConnectionStatus: boolean;
    clientConnectionMessage: string;
    amsInferenceDevice: AmsCameraDevice;
}

interface IDeviceOperationResult {
    status: boolean;
    message: string;
}

interface IModuleDeploymentProperties {
    lvaEdgeModuleId: string;
    amsAccountName: string;
}

interface IIoTCentralAppKeys {
    iotCentralAppHost: string;
    iotCentralAppApiToken: string;
    iotCentralDeviceProvisioningKey: string;
    iotCentralScopeId: string;
}

interface ISystemProperties {
    cpuModel: string;
    cpuCores: number;
    cpuUsage: number;
    totalMemory: number;
    freeMemory: number;
}

enum LvaGatewayDeviceProperties {
    Manufacturer = 'manufacturer',
    Model = 'model',
    SwVersion = 'swVersion',
    OsName = 'osName',
    ProcessorArchitecture = 'processorArchitecture',
    ProcessorManufacturer = 'processorManufacturer',
    TotalStorage = 'totalStorage',
    TotalMemory = 'totalMemory'
}

enum LvaGatewaySettings {
    DebugTelemetry = 'wpDebugTelemetry',
    DebugRoutedMessage = 'wpDebugRoutedMessage'
}

interface ILvaGatewaySettings {
    [LvaGatewaySettings.DebugTelemetry]: boolean;
    [LvaGatewaySettings.DebugRoutedMessage]: boolean;
}

enum IoTCentralClientState {
    Disconnected = 'disconnected',
    Connected = 'connected'
}

enum ModuleState {
    Inactive = 'inactive',
    Active = 'active'
}

enum AddCameraCommandRequestParams {
    CameraId = 'AddCameraRequestParams_CameraId',
    CameraName = 'AddCameraRequestParams_CameraName',
    RtspUrl = 'AddCameraRequestParams_RtspUrl',
    RtspAuthUsername = 'AddCameraRequestParams_RtspAuthUsername',
    RtspAuthPassword = 'AddCameraRequestParams_RtspAuthPassword',
    DetectionType = 'AddCameraRequestParams_DetectionType'
}

enum AddCameraDetectionType {
    Motion = 'motion',
    Object = 'object'
}

const LvaInferenceDeviceMap = {
    [AddCameraDetectionType.Motion]: {
        templateId: 'urn:AzureMediaServices:LvaEdgeMotionDetectorDevice:1',
        deviceClass: AmsMotionDetectorDevice
    },
    [AddCameraDetectionType.Object]: {
        templateId: 'urn:AzureMediaServices:LvaEdgeObjectDetectorDevice:1',
        deviceClass: AmsObjectDetectorDevice
    }
};

enum RestartModuleCommandRequestParams {
    Timeout = 'RestartModuleRequestParams_Timeout'
}

enum DeleteCameraCommandRequestParams {
    CameraId = 'DeleteCameraRequestParams_CameraId'
}

const LvaGatewayInterface = {
    Telemetry: {
        SystemHeartbeat: 'tlSystemHeartbeat',
        FreeMemory: 'tlFreeMemory',
        ConnectedCameras: 'tlConnectedCameras'
    },
    State: {
        IoTCentralClientState: 'stIoTCentralClientState',
        ModuleState: 'stModuleState'
    },
    Event: {
        CreateCamera: 'evCreateCamera',
        DeleteCamera: 'evDeleteCamera',
        ModuleStarted: 'evModuleStarted',
        ModuleStopped: 'evModuleStopped',
        ModuleRestart: 'evModuleRestart'
    },
    Setting: {
        DebugTelemetry: LvaGatewaySettings.DebugTelemetry,
        DebugRoutedMessage: LvaGatewaySettings.DebugRoutedMessage
    },
    Command: {
        AddCamera: 'cmAddCamera',
        DeleteCamera: 'cmDeleteCamera',
        RestartModule: 'cmRestartModule'
    }
};

const LvaGatewayEdgeInputs = {
    CameraCommand: 'cameracommand',
    LvaDiagnostics: 'lvaDiagnostics',
    LvaOperational: 'lvaOperational',
    LvaTelemetry: 'lvaTelemetry'
};

const LvaGatewayCommands = {
    CreateCamera: 'createcamera',
    DeleteCamera: 'deletecamera',
    SendDeviceTelemetry: 'senddevicetelemetry',
    SendDeviceInferences: 'senddeviceinferences'
};

const defaultDpsProvisioningHost: string = 'global.azure-devices-provisioning.net';
const defaultHealthCheckRetries: number = 3;

@service('module')
export class ModuleService {
    @inject('$server')
    private server: Server;

    @inject('config')
    private config: ConfigService;

    @inject('storage')
    private storage: StorageService;

    private iotcGatewayInstanceId: string = '';
    private iotcGatewayModuleId: string = '';
    private moduleDeploymentProperties: IModuleDeploymentProperties = {
        lvaEdgeModuleId: '',
        amsAccountName: ''
    };
    private iotCentralAppKeys: IIoTCentralAppKeys;

    private moduleClient: ModuleClient = null;
    private moduleTwin: Twin = null;
    private deferredStart = defer();
    private healthState = HealthState.Good;
    private healthCheckFailStreak: number = 0;
    private moduleSettings: ILvaGatewaySettings = {
        [LvaGatewaySettings.DebugTelemetry]: false,
        [LvaGatewaySettings.DebugRoutedMessage]: false
    };
    private moduleSettingsDefaults: ILvaGatewaySettings = {
        [LvaGatewaySettings.DebugTelemetry]: false,
        [LvaGatewaySettings.DebugRoutedMessage]: false
    };
    private amsInferenceDeviceMap = new Map<string, AmsCameraDevice>();
    private dpsProvisioningHost: string = defaultDpsProvisioningHost;
    private healthCheckRetries: number = defaultHealthCheckRetries;

    public getInstanceId(): string {
        return this.iotcGatewayInstanceId;
    }

    public async init(): Promise<void> {
        this.server.log(['ModuleService', 'info'], 'initialize');

        this.server.method({ name: 'module.startModule', method: this.startModule });

        this.iotcGatewayInstanceId = this.config.get('IOTEDGE_DEVICEID') || '';
        this.iotcGatewayModuleId = this.config.get('IOTEDGE_MODULEID') || '';
        this.moduleDeploymentProperties.lvaEdgeModuleId = this.config.get('lvaEdgeModuleId') || '';
        this.moduleDeploymentProperties.amsAccountName = this.config.get('amsAccountName') || '';

        this.dpsProvisioningHost = this.config.get('dpsProvisioningHost') || defaultDpsProvisioningHost;
        this.healthCheckRetries = this.config.get('healthCheckRetries') || defaultHealthCheckRetries;
    }

    @bind
    public async startModule(): Promise<void> {
        let result = true;

        try {
            result = await this.connectModuleClient();

            if (result === true) {
                await this.deferredStart.promise;
            }
        }
        catch (ex) {
            result = false;

            this.server.log(['ModuleService', 'error'], `Exception during IoT Central device provsioning: ${ex.message}`);
        }

        this.healthState = result === true ? HealthState.Good : HealthState.Critical;
    }

    @bind
    public logger(tags: any, message: any) {
        this.server.log(tags, message);
    }

    @bind
    public async invokeLvaModuleMethod(methodName: string, payload: any): Promise<any> {
        const methodParams = {
            methodName,
            payload,
            connectTimeoutInSeconds: 30,
            responseTimeoutInSeconds: 30
        };

        const response = await this.moduleClient.invokeMethod(this.iotcGatewayInstanceId, this.moduleDeploymentProperties.lvaEdgeModuleId, methodParams);
        if (this.moduleSettings[LvaGatewaySettings.DebugTelemetry] === true) {
            this.server.log(['ModuleService', 'error'], `invokeLvaModuleMethod response: ${JSON.stringify(response, null, 4)}`);
        }

        if (response.payload?.error) {
            throw new Error(`(from invokeMethod) ${response.payload.error?.message}`);
        }
    }

    public async createCamera(cameraInfo: ICameraDeviceProvisionInfo): Promise<IProvisionResult> {
        return this.createAmsInferenceDevice(cameraInfo);
    }

    public async deleteCamera(cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        return this.amsInferenceDeviceOperation('DELETE_CAMERA', cameraOperationInfo);
    }

    public async sendCameraTelemetry(cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        return this.amsInferenceDeviceOperation('SEND_EVENT', cameraOperationInfo);
    }

    public async sendCameraInferences(cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        return this.amsInferenceDeviceOperation('SEND_INFERENCES', cameraOperationInfo);
    }

    @bind
    public async getHealth(): Promise<number> {
        let healthState = HealthState.Good;

        try {
            const systemProperties = await this.getSystemProperties();
            const freeMemory = systemProperties?.freeMemory || 0;

            await this.sendMeasurement({
                [LvaGatewayInterface.Telemetry.FreeMemory]: freeMemory,
                [LvaGatewayInterface.Telemetry.ConnectedCameras]: this.amsInferenceDeviceMap.size
            });

            // TODO:
            // Find the right threshold for this metric
            if (freeMemory === 0) {
                healthState = HealthState.Critical;
            }

            await this.sendMeasurement({ [LvaGatewayInterface.Telemetry.SystemHeartbeat]: healthState });

            if (healthState < HealthState.Good) {
                this.server.log(['HealthService', 'warning'], `Health check watch: ${healthState}`);

                if (++this.healthCheckFailStreak >= this.healthCheckRetries) {
                    await this.restartModule(10, 'checkHealthState');
                }
            }

            this.healthState = healthState;

            for (const device of this.amsInferenceDeviceMap) {
                forget(device[1].getHealth);
            }
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Error computing healthState: ${ex.message}`);
            healthState = HealthState.Critical;
        }

        return this.healthState;
    }

    public async sendMeasurement(data: any): Promise<void> {
        if (!data || !this.moduleClient) {
            return;
        }

        try {
            const iotcMessage = new IoTMessage(JSON.stringify(data));

            await this.moduleClient.sendOutputEvent('iotc', iotcMessage);

            if (this.moduleSettings[LvaGatewaySettings.DebugTelemetry] === true) {
                this.server.log(['ModuleService', 'info'], `sendEvent: ${JSON.stringify(data, null, 4)}`);
            }
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `sendMeasurement: ${ex.message}`);
        }
    }

    public async sendInferenceData(inferenceTelemetryData: any) {
        if (!inferenceTelemetryData || !this.moduleClient) {
            return;
        }

        try {
            await this.sendMeasurement(inferenceTelemetryData);
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `sendInferenceData: ${ex.message}`);
        }
    }

    public async restartModule(timeout: number, reason: string): Promise<void> {
        this.server.log(['ModuleService', 'info'], `Module restart requested...`);

        try {
            await this.sendMeasurement({
                [LvaGatewayInterface.Event.ModuleRestart]: reason,
                [LvaGatewayInterface.State.ModuleState]: ModuleState.Inactive,
                [LvaGatewayInterface.Event.ModuleStopped]: 'Module restart'
            });

            if (timeout > 0) {
                await new Promise((resolve) => {
                    setTimeout(() => {
                        return resolve();
                    }, 1000 * timeout);
                });
            }
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `${ex.message}`);
        }

        // let Docker restart our container
        this.server.log(['ModuleService', 'info'], `Shutting down main process - module container will restart`);
        process.exit(1);
    }

    private async getSystemProperties(): Promise<ISystemProperties> {
        const cpus = osCpus();
        const cpuUsageSamples = osLoadAvg();

        return {
            cpuModel: cpus[0]?.model || 'Unknown',
            cpuCores: cpus?.length || 0,
            cpuUsage: cpuUsageSamples[0],
            totalMemory: osTotalMem() / 1024,
            freeMemory: osFreeMem() / 1024
        };
    }

    private async getModuleProperties(): Promise<any> {
        let result = {};

        try {
            result = await this.storage.get('state', 'iotCentral.properties');
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Error reading module properties: ${ex.message}`);
        }

        return result;
    }

    private async getIoTCentralAppKeys(): Promise<IIoTCentralAppKeys> {
        let result;

        try {
            result = await this.storage.get('state', 'iotCentral.appKeys');
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Error reading app keys: ${ex.message}`);
        }

        return result;
    }

    private async connectModuleClient(): Promise<boolean> {
        let result = true;
        let connectionStatus = `IoT Central successfully connected module: ${this.iotcGatewayModuleId}, instance id: ${this.iotcGatewayInstanceId}`;

        if (this.moduleClient) {
            await this.moduleClient.close();
            this.moduleClient = null;
            this.moduleTwin = null;
        }

        try {
            this.server.log(['ModuleService', 'info'], `IOTEDGE_WORKLOADURI: ${this.config.get('IOTEDGE_WORKLOADURI')}`);
            this.server.log(['ModuleService', 'info'], `IOTEDGE_DEVICEID: ${this.config.get('IOTEDGE_DEVICEID')}`);
            this.server.log(['ModuleService', 'info'], `IOTEDGE_MODULEID: ${this.config.get('IOTEDGE_MODULEID')}`);
            this.server.log(['ModuleService', 'info'], `IOTEDGE_MODULEGENERATIONID: ${this.config.get('IOTEDGE_MODULEGENERATIONID')}`);
            this.server.log(['ModuleService', 'info'], `IOTEDGE_IOTHUBHOSTNAME: ${this.config.get('IOTEDGE_IOTHUBHOSTNAME')}`);
            this.server.log(['ModuleService', 'info'], `IOTEDGE_AUTHSCHEME: ${this.config.get('IOTEDGE_AUTHSCHEME')}`);

            this.moduleClient = await ModuleClient.fromEnvironment(Mqtt);
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Failed to instantiate client interface from configuraiton: ${ex.message}`);
        }

        if (!this.moduleClient) {
            return false;
        }

        try {
            await this.moduleClient.open();

            this.server.log(['ModuleService', 'info'], `Client is connected`);

            // TODO:
            // Should the module twin interface get connected *BEFORE* opening
            // the moduleClient above?
            this.moduleTwin = await this.moduleClient.getTwin();
            this.moduleTwin.on('properties.desired', this.onHandleModuleProperties);

            this.moduleClient.on('error', this.onModuleClientError);

            this.moduleClient.onMethod(LvaGatewayInterface.Command.AddCamera, this.addCameraDirectMethod);
            this.moduleClient.onMethod(LvaGatewayInterface.Command.DeleteCamera, this.deleteCameraDirectMethod);
            this.moduleClient.onMethod(LvaGatewayInterface.Command.RestartModule, this.restartModuleDirectMethod);
            this.moduleClient.on('inputMessage', this.onHandleDownstreamMessages);

            const systemProperties = await this.getSystemProperties();
            const moduleProperties = await this.getModuleProperties();
            this.iotCentralAppKeys = await this.getIoTCentralAppKeys();

            const deviceProperties = {
                ...moduleProperties,
                [LvaGatewayDeviceProperties.OsName]: osPlatform() || '',
                [LvaGatewayDeviceProperties.SwVersion]: osRelease() || '',
                [LvaGatewayDeviceProperties.ProcessorArchitecture]: osArch() || '',
                [LvaGatewayDeviceProperties.TotalMemory]: systemProperties.totalMemory
            };

            await this.updateModuleProperties(deviceProperties);

            await this.sendMeasurement({
                [LvaGatewayInterface.State.IoTCentralClientState]: IoTCentralClientState.Connected,
                [LvaGatewayInterface.State.ModuleState]: ModuleState.Active,
                [LvaGatewayInterface.Event.ModuleStarted]: 'Module initialization'
            });

            await this.recreateExistingDevices();
        }
        catch (ex) {
            connectionStatus = `IoT Central connection error: ${ex.message}`;
            this.server.log(['ModuleService', 'error'], connectionStatus);

            result = false;
        }

        return result;
    }

    private async recreateExistingDevices() {
        this.server.log(['ModuleService', 'info'], 'recreateExistingDevices');

        try {
            const deviceListResponse = await this.iotcApiRequest(
                `https://${this.iotCentralAppKeys.iotCentralAppHost}/api/preview/devices`,
                'get',
                {
                    headers: {
                        Authorization: this.iotCentralAppKeys.iotCentralAppApiToken
                    },
                    json: true
                });

            const deviceList = deviceListResponse.payload?.value || [];

            this.server.log(['ModuleService', 'info'], `Found ${deviceList.length} devices`);

            for (const device of deviceList) {
                try {
                    this.server.log(['ModuleService', 'info'], `Getting properties for device: ${device.id}`);

                    const devicePropertiesResponse = await this.iotcApiRequest(
                        `https://${this.iotCentralAppKeys.iotCentralAppHost}/api/preview/devices/${device.id}/properties`,
                        'get',
                        {
                            headers: {
                                Authorization: this.iotCentralAppKeys.iotCentralAppApiToken
                            },
                            json: true
                        });

                    if (devicePropertiesResponse.payload.IoTCameraInterface?.[AmsDeviceTag] === `${this.iotcGatewayInstanceId}:${AmsDeviceTagValue}`) {
                        const deviceInterfaceProperties = devicePropertiesResponse.payload.IoTCameraInterface;

                        const detectionType = devicePropertiesResponse.payload.AiMotionDetectorInterface ? AddCameraDetectionType.Motion : AddCameraDetectionType.Object;
                        this.server.log(['ModuleService', 'info'], `Recreating device: ${device.id} - detectionType: ${detectionType}`);

                        await this.createAmsInferenceDevice({
                            cameraId: device.id,
                            cameraName: deviceInterfaceProperties.rpCameraName,
                            rtspUrl: deviceInterfaceProperties.rpRtspUrl,
                            rtspAuthUsername: deviceInterfaceProperties.rpRtspAuthUsername,
                            rtspAuthPassword: deviceInterfaceProperties.rpRtspAuthPassword,
                            detectionType
                        });
                    }
                    else {
                        this.server.log(['ModuleService', 'info'], `Found device: ${device.id} - but it is not an AMS camera device`);
                    }
                }
                catch (ex) {
                    this.server.log(['ModuleService', 'error'], `An error occurred while re-creating devices: ${ex.message}`);
                }
            }
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Failed to get device list: ${ex.message}`);
        }

        // If there were errors, we may be in a bad state (e.g. an ams inference device exists
        // but we were not able to re-connect to it's client interface). Consider setting the health
        // state to critical here to restart the gateway module.
    }

    @bind
    private async onHandleDownstreamMessages(inputName: string, message: IoTMessage) {
        if (!this.moduleClient || !message) {
            return;
        }

        try {
            await this.moduleClient.complete(message);

            const messageData = message.getBytes().toString('utf8');
            if (!messageData) {
                return;
            }

            const messageJson = JSON.parse(messageData);

            if (this.moduleSettings[LvaGatewaySettings.DebugRoutedMessage] === true) {
                if (message.properties?.propertyList) {
                    this.server.log(['ModuleService', 'info'], `Routed message properties: ${JSON.stringify(message.properties?.propertyList, null, 4)}`);
                }

                this.server.log(['ModuleService', 'info'], `Routed message data: ${JSON.stringify(messageJson, null, 4)}`);
            }

            switch (inputName) {
                case LvaGatewayEdgeInputs.CameraCommand: {
                    const edgeInputCameraCommand = messageJson?.command;
                    const edgeInputCameraCommandData = messageJson?.data;

                    switch (edgeInputCameraCommand) {
                        case LvaGatewayCommands.CreateCamera:
                            await this.createAmsInferenceDevice({
                                cameraId: edgeInputCameraCommandData?.cameraId,
                                cameraName: edgeInputCameraCommandData?.cameraName,
                                rtspUrl: edgeInputCameraCommandData?.rtspUrl,
                                rtspAuthUsername: edgeInputCameraCommandData?.rtspAuthPassword,
                                rtspAuthPassword: edgeInputCameraCommandData?.rtspAuthUsername,
                                detectionType: edgeInputCameraCommandData?.detectionType
                            });
                            break;

                        case LvaGatewayCommands.DeleteCamera:
                            await this.amsInferenceDeviceOperation('DELETE_CAMERA', edgeInputCameraCommandData);
                            break;

                        case LvaGatewayCommands.SendDeviceTelemetry:
                            await this.amsInferenceDeviceOperation('SEND_EVENT', edgeInputCameraCommandData);
                            break;

                        case LvaGatewayCommands.SendDeviceInferences:
                            await this.amsInferenceDeviceOperation('SEND_INFERENCES', edgeInputCameraCommandData);
                            break;

                        default:
                            this.server.log(['ModuleService', 'warning'], `Warning: received routed message for unknown input: ${inputName}`);
                            break;
                    }

                    break;
                }

                case LvaGatewayEdgeInputs.LvaDiagnostics:
                case LvaGatewayEdgeInputs.LvaOperational:
                case LvaGatewayEdgeInputs.LvaTelemetry: {
                    const cameraId = AmsGraph.getCameraIdFromLvaMessage(message);
                    if (!cameraId) {
                        this.server.log(['ModuleService', 'error'], `Received LvaDiagnostics telemetry but no cameraId found in subject`);
                        this.server.log(['ModuleService', 'error'], `LvaDiagnostics eventType: ${AmsGraph.getLvaMessageProperty(message, 'eventType')}`);
                        this.server.log(['ModuleService', 'error'], `LvaDiagnostics subject: ${AmsGraph.getLvaMessageProperty(message, 'subject')}`);
                        break;
                    }

                    const amsInferenceDevice = this.amsInferenceDeviceMap.get(cameraId);
                    if (!amsInferenceDevice) {
                        this.server.log(['ModuleService', 'error'], `Received Lva Edge telemetry for cameraId: "${cameraId}" but that device does not exist in Lva Gateway`);
                    }
                    else {
                        if (inputName === LvaGatewayEdgeInputs.LvaDiagnostics || inputName === LvaGatewayEdgeInputs.LvaOperational) {
                            await amsInferenceDevice.sendLvaEvent(AmsGraph.getLvaMessageProperty(message, 'eventType'));
                        }
                        else {
                            await amsInferenceDevice.processLvaInferences(messageJson.inferences);
                        }
                    }

                    break;
                }

                default:
                    this.server.log(['ModuleService', 'warning'], `Warning: received routed message for unknown input: ${inputName}`);
                    break;
            }
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Error while handling downstream message: ${ex.message}`);
        }
    }

    private async createAmsInferenceDevice(cameraInfo: ICameraDeviceProvisionInfo): Promise<IProvisionResult> {
        this.server.log(['ModuleService', 'info'], `createAmsInferenceDevice - cameraId: ${cameraInfo.cameraId}, cameraName: ${cameraInfo.cameraName}, detectionType: ${cameraInfo.detectionType}`);

        let deviceProvisionResult: IProvisionResult = {
            dpsProvisionStatus: false,
            dpsProvisionMessage: '',
            dpsHubConnectionString: '',
            clientConnectionStatus: false,
            clientConnectionMessage: '',
            amsInferenceDevice: null
        };

        try {
            if (!cameraInfo.cameraId) {
                deviceProvisionResult.dpsProvisionStatus = false;
                deviceProvisionResult.dpsProvisionMessage = `Missing device configuration - skipping DPS provisioning`;

                this.server.log(['ModuleService', 'error'], deviceProvisionResult.dpsProvisionMessage);

                return deviceProvisionResult;
            }

            if (!this.iotCentralAppKeys.iotCentralAppHost
                || !this.iotCentralAppKeys.iotCentralAppApiToken
                || !this.iotCentralAppKeys.iotCentralDeviceProvisioningKey
                || !this.iotCentralAppKeys.iotCentralScopeId) {

                deviceProvisionResult.dpsProvisionStatus = false;
                deviceProvisionResult.dpsProvisionMessage = `Missing camera management settings (ScopeId)`;
                this.server.log(['ModuleService', 'error'], deviceProvisionResult.dpsProvisionMessage);

                return deviceProvisionResult;
            }

            deviceProvisionResult = await this.createAndProvisionAmsInferenceDevice(cameraInfo);
            if (deviceProvisionResult.dpsProvisionStatus === true && deviceProvisionResult.clientConnectionStatus === true) {
                this.amsInferenceDeviceMap.set(cameraInfo.cameraId, deviceProvisionResult.amsInferenceDevice);

                await this.sendMeasurement({ [LvaGatewayInterface.Event.CreateCamera]: cameraInfo.cameraId });

                this.server.log(['ModuleService', 'info'], `Succesfully provisioned camera device with id: ${cameraInfo.cameraId}`);
            }
        }
        catch (ex) {
            deviceProvisionResult.dpsProvisionStatus = false;
            deviceProvisionResult.dpsProvisionMessage = `Error while processing downstream message: ${ex.message}`;

            this.server.log(['ModuleService', 'error'], deviceProvisionResult.dpsProvisionMessage);
        }

        return deviceProvisionResult;
    }

    private async createAndProvisionAmsInferenceDevice(cameraInfo: ICameraDeviceProvisionInfo): Promise<IProvisionResult> {
        this.server.log(['ModuleService', 'info'], `Provisioning device - id: ${cameraInfo.cameraId}`);

        const deviceProvisionResult: IProvisionResult = {
            dpsProvisionStatus: false,
            dpsProvisionMessage: '',
            dpsHubConnectionString: '',
            clientConnectionStatus: false,
            clientConnectionMessage: '',
            amsInferenceDevice: null
        };

        try {
            const amsGraph = await AmsGraph.createAmsGraph(this, this.moduleDeploymentProperties.amsAccountName, cameraInfo);

            const deviceKey = this.computeDeviceKey(cameraInfo.cameraId, this.iotCentralAppKeys.iotCentralDeviceProvisioningKey);
            const provisioningSecurityClient = new SymmetricKeySecurityClient(cameraInfo.cameraId, deviceKey);
            const provisioningClient = ProvisioningDeviceClient.create(
                this.dpsProvisioningHost,
                this.iotCentralAppKeys.iotCentralScopeId,
                new ProvisioningTransport(),
                provisioningSecurityClient);

            provisioningClient.setProvisioningPayload({
                iotcModelId: LvaInferenceDeviceMap[cameraInfo.detectionType].templateId,
                iotcGateway: {
                    iotcGatewayId: this.iotcGatewayInstanceId,
                    iotcModuleId: this.iotcGatewayModuleId
                }
            });

            const dpsConnectionString = await new Promise<string>((resolve, reject) => {
                provisioningClient.register((dpsError, dpsResult) => {
                    if (dpsError) {
                        return reject(dpsError);
                    }

                    this.server.log(['ModuleService', 'info'], `DPS registration succeeded - hub: ${dpsResult.assignedHub}`);

                    return resolve(`HostName=${dpsResult.assignedHub};DeviceId=${dpsResult.deviceId};SharedAccessKey=${deviceKey}`);
                });
            });

            deviceProvisionResult.dpsProvisionStatus = true;
            deviceProvisionResult.dpsProvisionMessage = `IoT Central successfully provisioned device: ${cameraInfo.cameraId}`;
            deviceProvisionResult.dpsHubConnectionString = dpsConnectionString;

            deviceProvisionResult.amsInferenceDevice = new LvaInferenceDeviceMap[cameraInfo.detectionType].deviceClass(this, amsGraph, cameraInfo);

            const { clientConnectionStatus, clientConnectionMessage } = await deviceProvisionResult.amsInferenceDevice.connectDeviceClient(deviceProvisionResult.dpsHubConnectionString);
            deviceProvisionResult.clientConnectionStatus = clientConnectionStatus;
            deviceProvisionResult.clientConnectionMessage = clientConnectionMessage;
        }
        catch (ex) {
            deviceProvisionResult.dpsProvisionStatus = false;
            deviceProvisionResult.dpsProvisionMessage = `Error while provisioning device: ${ex.message}`;

            this.server.log(['ModuleService', 'error'], deviceProvisionResult.dpsProvisionMessage);
        }

        return deviceProvisionResult;
    }

    private async deprovisionAmsInferenceDevice(cameraId: string): Promise<boolean> {
        this.server.log(['ModuleService', 'info'], `Deprovisioning device - id: ${cameraId}`);

        let result = false;

        try {
            const amsInferenceDevice = this.amsInferenceDeviceMap.get(cameraId);
            if (amsInferenceDevice) {
                await amsInferenceDevice.deleteCamera();
                this.amsInferenceDeviceMap.delete(cameraId);
            }

            this.server.log(['ModuleService', 'info'], `Deleting IoT Central device instance: ${cameraId}`);
            try {
                await this.iotcApiRequest(
                    `https://${this.iotCentralAppKeys.iotCentralAppHost}/api/preview/devices/${cameraId}`,
                    'delete',
                    {
                        headers: {
                            Authorization: this.iotCentralAppKeys.iotCentralAppApiToken
                        },
                        json: true
                    });

                await this.sendMeasurement({ [LvaGatewayInterface.Event.DeleteCamera]: cameraId });

                this.server.log(['ModuleService', 'info'], `Succesfully de-provisioned camera device with id: ${cameraId}`);

                result = true;
            }
            catch (ex) {
                this.server.log(['ModuleService', 'error'], `Requeset to delete the IoT Central device failed: ${ex.message}`);
            }
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Failed de-provision device: ${ex.message}`);
        }

        return result;
    }

    private computeDeviceKey(deviceId: string, masterKey: string) {
        return crypto.createHmac('SHA256', Buffer.from(masterKey, 'base64')).update(deviceId, 'utf8').digest('base64');
    }

    private async amsInferenceDeviceOperation(deviceOperation: DeviceOperation, cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        this.server.log(['ModuleService', 'info'], `Processing LVA Edge gateway operation: ${JSON.stringify(cameraOperationInfo, null, 4)}`);

        const operationResult = {
            status: false,
            message: ''
        };

        const cameraId = cameraOperationInfo?.cameraId;
        if (!cameraId) {
            operationResult.message = `Missing cameraId`;

            this.server.log(['ModuleService', 'error'], operationResult.message);

            return operationResult;
        }

        const amsInferenceDevice = this.amsInferenceDeviceMap.get(cameraId);
        if (!amsInferenceDevice) {
            operationResult.message = `No device exists with cameraId: ${cameraId}`;

            this.server.log(['ModuleService', 'error'], operationResult.message);

            return operationResult;
        }

        const operationInfo = cameraOperationInfo?.operationInfo;
        if (!operationInfo) {
            operationResult.message = `Missing operationInfo data`;

            this.server.log(['ModuleService', 'error'], operationResult.message);

            return operationResult;
        }

        switch (deviceOperation) {
            case 'DELETE_CAMERA':
                await this.deprovisionAmsInferenceDevice(cameraId);
                break;

            case 'SEND_EVENT':
                await amsInferenceDevice.sendLvaEvent(operationInfo);
                break;

            case 'SEND_INFERENCES':
                await amsInferenceDevice.processLvaInferences(operationInfo);
                break;

            default:
                this.server.log(['ModuleService', 'error'], `Unkonwn device operation: ${deviceOperation}`);
                break;
        }

        return {
            status: true,
            message: `Success`
        };
    }

    @bind
    private onModuleClientError(error: Error) {
        this.server.log(['ModuleService', 'error'], `Module client connection error: ${error.message}`);
        this.healthState = HealthState.Critical;
    }

    private async updateModuleProperties(properties: any): Promise<void> {
        if (!properties || !this.moduleTwin) {
            return;
        }

        try {
            await new Promise((resolve, reject) => {
                this.moduleTwin.properties.reported.update(properties, (error) => {
                    if (error) {
                        return reject(error);
                    }

                    return resolve();
                });
            });

            this.server.log(['ModuleService', 'info'], `Module properties updated: ${JSON.stringify(properties, null, 4)}`);
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Error updating module properties: ${ex.message}`);
        }
    }

    @bind
    private async onHandleModuleProperties(desiredChangedSettings: any) {
        this.server.log(['ModuleService', 'info'], `desiredChangedSettings:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

        const patchedProperties = {};
        const moduleSettingsForPatching = this.getModuleSettingsForPatching();

        for (const desiredSettingsKey in desiredChangedSettings) {
            if (!desiredChangedSettings.hasOwnProperty(desiredSettingsKey)) {
                continue;
            }

            if (desiredSettingsKey === '$version') {
                continue;
            }

            try {
                let changedSettingResult;

                switch (desiredSettingsKey) {
                    case LvaGatewayInterface.Setting.DebugTelemetry:
                    case LvaGatewayInterface.Setting.DebugRoutedMessage:
                        changedSettingResult = await this.moduleSettingChange(moduleSettingsForPatching, desiredSettingsKey, desiredChangedSettings?.[`${desiredSettingsKey}`]);
                        break;

                    default:
                        this.server.log(['ModuleService', 'error'], `Received desired property change for unknown setting '${desiredSettingsKey}'`);
                        break;
                }

                if (changedSettingResult?.status === true) {
                    patchedProperties[desiredSettingsKey] = changedSettingResult?.value;
                }
            }
            catch (ex) {
                this.server.log(['ModuleService', 'error'], `Exception while handling desired properties: ${ex.message}`);
            }
        }

        for (const moduleSettingsKey in moduleSettingsForPatching) {
            if (!moduleSettingsForPatching.hasOwnProperty(moduleSettingsKey)) {
                continue;
            }

            if (!moduleSettingsForPatching[moduleSettingsKey].handled) {
                this.server.log(['ModuleService', 'info'], `Adding patched property '${moduleSettingsKey}' setting value to: '${this.moduleSettingsDefaults[moduleSettingsKey]}'`);
                patchedProperties[moduleSettingsKey] = this.moduleSettingsDefaults[moduleSettingsKey];
            }

            this.moduleSettings[moduleSettingsKey] = moduleSettingsForPatching[moduleSettingsKey].value;
        }

        if (!emptyObj(patchedProperties)) {
            await this.updateModuleProperties(patchedProperties);
        }

        this.deferredStart.resolve();
    }

    private getModuleSettingsForPatching() {
        const moduleSettingsForPatching = {};

        for (const moduleSettingsKey in this.moduleSettings) {
            if (!this.moduleSettings.hasOwnProperty(moduleSettingsKey)) {
                continue;
            }

            moduleSettingsForPatching[moduleSettingsKey] = {
                handled: false,
                value: this.moduleSettings[moduleSettingsKey]
            };
        }

        return moduleSettingsForPatching;
    }

    private async moduleSettingChange(moduleSettingsForPatching: any, setting: string, value: any): Promise<any> {
        this.server.log(['ModuleService', 'info'], `Handle module setting change for '${setting}': ${typeof value === 'object' && value !== null ? JSON.stringify(value, null, 4) : value}`);

        const result = {
            value: undefined,
            status: true
        };

        switch (setting) {
            case LvaGatewayInterface.Setting.DebugTelemetry:
            case LvaGatewayInterface.Setting.DebugRoutedMessage:
                result.value = moduleSettingsForPatching[setting].value = value || false;
                moduleSettingsForPatching[setting].handled = true;
                break;

            default:
                this.server.log(['ModuleService', 'info'], `Unknown module setting change request '${setting}'`);
                result.status = false;
        }

        return result;
    }

    @bind
    // @ts-ignore
    private async addCameraDirectMethod(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.server.log(['ModuleService', 'info'], `${LvaGatewayInterface.Command.AddCamera} command received`);

        try {
            const cameraId = commandRequest?.payload?.[AddCameraCommandRequestParams.CameraId];
            const cameraName = commandRequest?.payload?.[AddCameraCommandRequestParams.CameraName];
            const rtspUrl = commandRequest?.payload?.[AddCameraCommandRequestParams.RtspUrl];
            const rtspAuthUsername = commandRequest?.payload?.[AddCameraCommandRequestParams.RtspAuthUsername];
            const rtspAuthPassword = commandRequest?.payload?.[AddCameraCommandRequestParams.RtspAuthPassword];
            const detectionType = commandRequest?.payload?.[AddCameraCommandRequestParams.DetectionType];

            if (!cameraId || !cameraName || !rtspUrl || !rtspAuthUsername || !rtspAuthPassword || !detectionType) {
                await commandResponse.send(202, {
                    value: `The ${LvaGatewayInterface.Command.DeleteCamera} command is missing required parameters, cameraId, cameraName, rtspUrl, rtspAuthUsername, rtspAuthPassword, detectionType`
                });

                return;
            }

            const provisionResult = await this.createAmsInferenceDevice({
                cameraId,
                cameraName,
                rtspUrl,
                rtspAuthUsername,
                rtspAuthPassword,
                detectionType
            });

            await commandResponse.send(202, {
                value: provisionResult.clientConnectionMessage

            });
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Error creating LVA Edge gateway camera device: ${ex.message}`);
        }
    }

    @bind
    private async deleteCameraDirectMethod(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.server.log(['ModuleService', 'info'], `${LvaGatewayInterface.Command.DeleteCamera} command received`);

        try {
            const cameraId = commandRequest?.payload?.[DeleteCameraCommandRequestParams.CameraId];
            if (!cameraId) {
                await commandResponse.send(202, {
                    value: `The ${LvaGatewayInterface.Command.DeleteCamera} command requires a Camera Id parameter`
                });

                return;
            }

            const deleteResult = await this.deprovisionAmsInferenceDevice(cameraId);

            await commandResponse.send(202, {
                value: deleteResult
                    ? `The ${LvaGatewayInterface.Command.DeleteCamera} command succeeded`
                    : `An error occurred while executing the ${LvaGatewayInterface.Command.DeleteCamera} command`

            });
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Error deleting LVA Edge gateway camera device: ${ex.message}`);
        }
    }

    @bind
    private async restartModuleDirectMethod(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.server.log(['ModuleService', 'info'], `${LvaGatewayInterface.Command.RestartModule} command received`);

        try {
            // sending response before processing, since this is a restart request
            await commandResponse.send(200, {
                value: 'Success'
            });

            await this.restartModule(commandRequest?.payload?.[RestartModuleCommandRequestParams.Timeout] || 0, 'RestartModule command received');
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `Error sending response for ${LvaGatewayInterface.Command.RestartModule} command: ${ex.message}`);
        }
    }

    private async iotcApiRequest(uri, method, options): Promise<any> {
        try {
            const iotcApiResponse = await Wreck[method](uri, options);

            if (iotcApiResponse.res.statusCode < 200 || iotcApiResponse.res.statusCode > 299) {
                this.server.log(['ModuleService', 'error'], `Response status code = ${iotcApiResponse.res.statusCode}`);

                throw ({
                    message: (iotcApiResponse.payload as any)?.message || iotcApiResponse.payload || 'An error occurred',
                    statusCode: iotcApiResponse.res.statusCode
                });
            }

            return iotcApiResponse;
        }
        catch (ex) {
            this.server.log(['ModuleService', 'error'], `iotcApiRequest: ${ex.message}`);
            throw ex;
        }
    }
}
