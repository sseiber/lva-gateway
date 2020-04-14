import { service, inject } from 'spryly';
import { Server } from '@hapi/hapi';
import { LoggingService } from './logging';
import { ConfigService } from './config';
import { StorageService } from './storage';
import { HealthState } from './health';
import {
    IDeviceProps,
    StartLVARequestEnum,
    AxisDevice
} from './device';
import { Mqtt } from 'azure-iot-device-mqtt';
import {
    ModuleClient,
    Twin,
    Message,
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
import * as fse from 'fs-extra';
import { resolve as pathResolve } from 'path';
import * as crypto from 'crypto';
import * as ipAddress from 'ip';
import * as _get from 'lodash.get';
import * as _random from 'lodash.random';
import { bind, emptyObj, forget } from '../utils';

export interface IDpsInfo {
    scopeId: string;
    templateId: string;
    iotcGatewayInstanceId: string;
    iotcModuleId: string;
    deviceId: string;
    deviceKey: string;
}

type DeviceOperation = 'UPDATE_CAMERA' | 'DELETE_CAMERA' | 'SEND_TELEMETRY' | 'SEND_INFERENCES';

export interface ICameraOperationInfo {
    cameraId: string;
    operationInfo: any;
}

export interface IProvisionResult {
    dpsProvisionStatus: boolean;
    dpsProvisionMessage: string;
    dpsHubConnectionString: string;
    clientConnectionStatus: boolean;
    clientConnectionMessage: string;
    axisDevice: AxisDevice;
}

export interface IDeviceOperationResult {
    status: boolean;
    message: string;
}

interface ISystemProperties {
    cpuModel: string;
    cpuCores: number;
    cpuUsage: number;
    totalMemory: number;
    freeMemory: number;
}

const AxisModuleProperties = {
    Manufacturer: 'manufacturer',
    Model: 'model',
    SwVersion: 'swVersion',
    OsName: 'osName',
    ProcessorArchitecture: 'processorArchitecture',
    ProcessorManufacturer: 'processorManufacturer',
    TotalStorage: 'totalStorage',
    TotalMemory: 'totalMemory'
};

interface IModuleSettings {
    wpMasterDeviceProvisioningKey: string;
    wpScopeId: string;
    wpDeviceTemplateId: string;
    wpGatewayInstanceId: string;
    wpGatewayModuleId: string;
    wpLvaEdgeModuleId: string;
}

enum IoTCentralClientState {
    Disconnected = 'disconnected',
    Connected = 'connected'
}

enum ModuleState {
    Inactive = 'inactive',
    Active = 'active'
}

enum RestartModuleCommandRequestParams {
    Timeout = 'RestartModuleRequestParams_Timeout'
}

enum AddCameraCommandRequestParams {
    CameraId = 'AddCameraRequestParams_CameraId',
    CameraName = 'AddCameraRequestParams_CameraName',
    RtspUrl = 'AddCameraRequestParams_RtspUrl',
    RtspAuthUsername = 'AddCameraRequestParams_RtspAuthUsername',
    RtspAuthPassword = 'AddCameraRequestParams_RtspAuthPassword',
    Manufacturer = 'AddCameraRequestParams_Manufacturer',
    Model = 'AddCameraRequestParams_Model'
}

export interface ICommandResponse {
    statusCode: number;
    message: string;
}

export const ModuleInterface = {
    Telemetry: {
        SystemHeartbeat: 'tlSystemHeartbeat',
        FreeMemory: 'tlFreeMemory'
    },
    State: {
        IoTCentralClientState: 'stIoTCentralClientState',
        ModuleState: 'stModuleState'
    },
    Event: {
        CreateCamera: 'evCreateCamera',
        UpdateCamera: 'evUpdateCamera',
        DeleteCamera: 'evDeleteCamera',
        ModuleStarted: 'evModuleStarted',
        ModuleStopped: 'evModuleStopped',
        ModuleRestart: 'evModuleRestart'
    },
    Setting: {
        MasterDeviceProvisioningKey: 'wpMasterDeviceProvisioningKey',
        ScopeId: 'wpScopeId',
        DeviceTemplateId: 'wpDeviceTemplateId',
        GatewayInstanceId: 'wpGatewayInstanceId',
        GatewayModuleId: 'wpGatewayModuleId',
        LvaEdgeModuleId: 'wpLvaEdgeModuleId'
    },
    Property: {
        ModuleIpAddress: 'rpModuleIpAddress'
    },
    Command: {
        RestartModule: 'cmRestartModule',
        AddCamera: 'cmAddCamera'
    }
};

const AxisManagementEdgeInputs = {
    CameraCommand: 'cameracommand',
    LvaTelemetry: 'lvaTelemetry'
};

const AxisManagementCommands = {
    CreateCamera: 'createcamera',
    UpdateCamera: 'updatecamera',
    DeleteCamera: 'deletecamera',
    SendDeviceTelemetry: 'senddevicetelemetry',
    SendDeviceInferences: 'senddeviceinferences'
};

const defaultHealthCheckRetries: number = 3;

@service('module')
export class ModuleService {
    @inject('$server')
    private server: Server;

    @inject('logger')
    private logger: LoggingService;

    @inject('config')
    private config: ConfigService;

    @inject('storage')
    private storage: StorageService;

    private iotcModuleId: string = '';
    private moduleClient: ModuleClient = null;
    private moduleTwin: Twin = null;
    private healthState = HealthState.Good;
    private healthCheckFailStreak: number = 0;
    private moduleIpAddress: string = '127.0.0.1';
    private moduleSettings: IModuleSettings = {
        wpMasterDeviceProvisioningKey: '',
        wpScopeId: '',
        wpDeviceTemplateId: '',
        wpGatewayInstanceId: '',
        wpGatewayModuleId: '',
        wpLvaEdgeModuleId: ''
    };
    private moduleSettingsDefaults: IModuleSettings = {
        wpMasterDeviceProvisioningKey: '',
        wpScopeId: '',
        wpDeviceTemplateId: '',
        wpGatewayInstanceId: '',
        wpGatewayModuleId: '',
        wpLvaEdgeModuleId: ''
    };
    private axisDeviceMap = new Map<string, AxisDevice>();
    private healthCheckRetries: number = defaultHealthCheckRetries;

    public getLogger() {
        return this.logger;
    }

    public async init(): Promise<void> {
        this.logger.log(['ModuleService', 'info'], 'initialize');

        this.server.method({ name: 'module.startModule', method: this.startModule });

        this.iotcModuleId = this.config.get('IOTEDGE_MODULEID') || '';

        this.moduleIpAddress = ipAddress.address() || '127.0.0.1';

        this.healthCheckRetries = this.config.get('healthCheckRetries') || defaultHealthCheckRetries;
    }

    @bind
    public async startModule(): Promise<void> {
        let result = true;

        try {
            result = await this.connectModuleClient();
        }
        catch (ex) {
            result = false;

            this.logger.log(['ModuleService', 'error'], `Exception during IoT Central device provsioning: ${ex.message}`);
        }

        this.healthState = result === true ? HealthState.Good : HealthState.Critical;
    }

    public async createDevice(deviceProps: IDeviceProps): Promise<IProvisionResult> {
        return this.createAxisDevice(deviceProps);
    }

    public async updateDevice(cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        return this.axisDeviceOperation('UPDATE_CAMERA', cameraOperationInfo);
    }

    public async deleteDevice(cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        return this.axisDeviceOperation('DELETE_CAMERA', cameraOperationInfo);
    }

    public async sendDeviceTelemetry(cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        return this.axisDeviceOperation('SEND_TELEMETRY', cameraOperationInfo);
    }

    public async sendDeviceInferences(cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        return this.axisDeviceOperation('SEND_INFERENCES', cameraOperationInfo);
    }

    @bind
    public async getHealth(): Promise<number> {
        let healthState = HealthState.Good;

        try {
            const systemProperties = await this.getSystemProperties();
            const freeMemory = _get(systemProperties, 'freeMemory') || 0;

            await this.sendMeasurement({ [ModuleInterface.Telemetry.FreeMemory]: freeMemory });

            // TODO:
            // Find the right threshold for this metric
            if (freeMemory === 0) {
                healthState = HealthState.Critical;
            }

            await this.sendMeasurement({ [ModuleInterface.Telemetry.SystemHeartbeat]: healthState });

            if (healthState < HealthState.Good) {
                this.logger.log(['HealthService', 'warning'], `Health check watch: ${healthState}`);

                if (++this.healthCheckFailStreak >= this.healthCheckRetries) {
                    await this.restartModule(10, 'checkHealthState');
                }
            }

            this.healthState = healthState;

            for (const device of this.axisDeviceMap) {
                forget(device[1].getHealth);
            }
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error computing healthState: ${ex.message}`);
            healthState = HealthState.Critical;
        }

        return this.healthState;
    }

    @bind
    public async sendMeasurement(data: any): Promise<void> {
        if (!data || !this.moduleClient) {
            return;
        }

        try {
            const iotcMessage = new Message(JSON.stringify(data));

            await this.moduleClient.sendOutputEvent('iotc', iotcMessage);

            if (_get(process.env, 'DEBUG_MODULE_TELEMETRY') === '1') {
                this.logger.log(['ModuleService', 'info'], `sendEvent: ${JSON.stringify(data, null, 4)}`);
            }
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `sendMeasurement: ${ex.message}`);
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
            this.logger.log(['ModuleService', 'error'], `sendInferenceData: ${ex.message}`);
        }
    }

    public async restartModule(timeout: number, reason: string): Promise<void> {
        this.logger.log(['ModuleService', 'info'], `Module restart requested...`);

        try {
            await this.sendMeasurement({
                [ModuleInterface.Event.ModuleRestart]: reason,
                [ModuleInterface.State.ModuleState]: ModuleState.Inactive
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
            this.logger.log(['ModuleService', 'error'], `${ex.message}`);
        }

        // let Docker restart our container
        this.logger.log(['ModuleService', 'error'], `Exiting container now`);
        process.exit(1);
    }

    public async startLvaGraph(deviceProps: IDeviceProps, graphType: string): Promise<{ startLvaGraphResponse: ICommandResponse, graphInstance: any, graphTopology: any }> {
        this.logger.log(['ModuleService', 'info'], `startLvaGraph with graphType: ${graphType}`);

        try {
            let graphName = '';

            switch (graphType) {
                case StartLVARequestEnum.MotionDetection:
                    graphName = 'motion';
                    break;

                case StartLVARequestEnum.PeopleDetection:
                    graphName = 'people';
                    break;

                case StartLVARequestEnum.CarDetection:
                    graphName = 'car';
                    break;
            }

            const graphInstancePath = pathResolve(_get(this.server, 'settings.app.storageRootDirectory'), `${graphName}GraphInstance.json`);
            const graphInstance = fse.readJSONSync(graphInstancePath);

            graphInstance.name = (_get(graphInstance, 'name') || '').replace('###RtspCameraId', deviceProps.cameraId);
            graphInstance.properties.topologyName = (_get(graphInstance, 'properties.topologyName') || '###RtspCameraId').replace('###RtspCameraId', deviceProps.cameraId);

            this.logger.log(['ModuleService', 'info'], `### graphFilePath: ${graphInstancePath}`);
            this.logger.log(['ModuleService', 'info'], `### graphData: ${JSON.stringify(graphInstance, null, 4)}`);

            const graphTopologyPath = pathResolve(_get(this.server, 'settings.app.storageRootDirectory'), `${graphName}GraphTopology.json`);
            const graphTopology = fse.readJSONSync(graphTopologyPath);

            graphTopology.name = (_get(graphTopology, 'name') || '').replace('###RtspCameraId', deviceProps.cameraId);
            graphTopology.properties.sources[0].name = deviceProps.cameraId;
            graphTopology.properties.sources[0].endpoint.url = deviceProps.rtspUrl;
            graphTopology.properties.sources[0].endpoint.credentials.username = deviceProps.rtspAuthUsername;
            graphTopology.properties.sources[0].endpoint.credentials.password = deviceProps.rtspAuthPassword;
            graphTopology.properties.processors[0].inputs[1].moduleName = deviceProps.cameraId;
            graphTopology.properties.sinks[0].filePathPattern = (_get(graphTopology, 'properties.sinks.0.filePathPattern') || '###RtspCameraId').replace('###RtspCameraId', deviceProps.cameraId);

            this.logger.log(['ModuleService', 'info'], `### graphFilePath: ${graphTopologyPath}`);
            this.logger.log(['ModuleService', 'info'], `### graphData: ${JSON.stringify(graphTopology, null, 4)}`);

            const methodParams = {
                methodName: ``,
                payload: null,
                connectTimeoutInSeconds: 30,
                responseTimeoutInSeconds: 30
            };

            this.logger.log(['ModuleService', 'info'], `### GraphTopologySet`);
            methodParams.methodName = `GraphTopologySet`;
            methodParams.payload = graphTopology;
            await this.moduleClient.invokeMethod(this.moduleSettings.wpGatewayInstanceId, this.moduleSettings.wpLvaEdgeModuleId, methodParams);

            this.logger.log(['ModuleService', 'info'], `### GraphInstanceSet`);
            methodParams.methodName = `GraphInstanceSet`;
            methodParams.payload = graphInstance;
            await this.moduleClient.invokeMethod(this.moduleSettings.wpGatewayInstanceId, this.moduleSettings.wpLvaEdgeModuleId, methodParams);

            this.logger.log(['ModuleService', 'info'], `### GraphInstanceStart`);
            methodParams.methodName = `GraphInstanceStart`;
            methodParams.payload = graphInstance;
            await this.moduleClient.invokeMethod(this.moduleSettings.wpGatewayInstanceId, this.moduleSettings.wpLvaEdgeModuleId, methodParams);

            return {
                startLvaGraphResponse: {
                    statusCode: 201,
                    message: 'Start LVA Graph done'
                },
                graphInstance,
                graphTopology
            };
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `startLvaGraph error: ${ex.message}`);

            return {
                startLvaGraphResponse: {
                    statusCode: 400,
                    message: ex.mesage
                },
                graphInstance: null,
                graphTopology: null
            };
        }
    }

    public async stopLvaGraph(graphInstance: any, graphTopology: any): Promise<ICommandResponse> {
        try {
            const methodParams = {
                methodName: ``,
                payload: null,
                connectTimeoutInSeconds: 30,
                responseTimeoutInSeconds: 30
            };

            if (graphInstance && graphTopology) {
                this.logger.log(['ModuleService', 'info'], `### GraphInstanceStop`);
                methodParams.methodName = `GraphInstanceStop`;
                methodParams.payload = graphInstance;
                await this.moduleClient.invokeMethod(this.moduleSettings.wpGatewayInstanceId, this.moduleSettings.wpLvaEdgeModuleId, methodParams);

                this.logger.log(['ModuleService', 'info'], `### GraphInstanceDelete`);
                methodParams.methodName = `GraphInstanceDelete`;
                methodParams.payload = graphInstance;
                await this.moduleClient.invokeMethod(this.moduleSettings.wpGatewayInstanceId, this.moduleSettings.wpLvaEdgeModuleId, methodParams);

                this.logger.log(['ModuleService', 'info'], `### GraphTopologyDelete`);
                methodParams.methodName = `GraphTopologyDelete`;
                methodParams.payload = graphTopology;
                await this.moduleClient.invokeMethod(this.moduleSettings.wpGatewayInstanceId, this.moduleSettings.wpLvaEdgeModuleId, methodParams);
            }

            return {
                statusCode: 201,
                message: `Successfully stopped LVA graph: ${_get(graphInstance, 'name') || '(no graph was running)'}`
            };
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `stopLvaGraph error: ${ex.message}`);

            return {
                statusCode: 400,
                message: ex.message
            };
        }
    }

    public async recordFromCamera(cameraInfo: any): Promise<any> {
        const triggerData = {
            eventType: 'Microsoft.Media.Signaling.IoTHub',
            eventTarget: cameraInfo.cameraId
        };
        const iotcMessage = new Message(JSON.stringify(triggerData));

        await this.moduleClient.sendOutputEvent('lvaTrigger', iotcMessage);

        return {
            statusCode: 201,
            message: 'recordFromCamera request sent'
        };
    }

    private async getSystemProperties(): Promise<ISystemProperties> {
        const cpus = osCpus();
        const cpuUsageSamples = osLoadAvg();

        return {
            cpuModel: Array.isArray(cpus) ? cpus[0].model : 'Unknown',
            cpuCores: Array.isArray(cpus) ? cpus.length : 0,
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
            this.logger.log(['ModuleService', 'error'], `Error reading module properties: ${ex.message}`);
        }

        return result;
    }

    private async connectModuleClient(): Promise<boolean> {
        let result = true;
        let connectionStatus = `IoT Central successfully connected module: ${this.iotcModuleId}`;

        if (this.moduleClient) {
            await this.moduleClient.close();
            this.moduleClient = null;
            this.moduleTwin = null;
        }

        try {
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_WORKLOADURI: ${this.config.get('IOTEDGE_WORKLOADURI')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_DEVICEID: ${this.config.get('IOTEDGE_DEVICEID')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_MODULEID: ${this.config.get('IOTEDGE_MODULEID')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_MODULEGENERATIONID: ${this.config.get('IOTEDGE_MODULEGENERATIONID')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_IOTHUBHOSTNAME: ${this.config.get('IOTEDGE_IOTHUBHOSTNAME')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_AUTHSCHEME: ${this.config.get('IOTEDGE_AUTHSCHEME')}`);

            this.moduleClient = await ModuleClient.fromEnvironment(Mqtt);
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Failed to instantiate client interface from configuraiton: ${ex.message}`);
        }

        if (!this.moduleClient) {
            result = false;
        }

        if (result === true) {
            try {
                await this.moduleClient.open();

                this.logger.log(['ModuleService', 'info'], `Client is connected`);

                // TODO:
                // Should the module twin interface get connected *BEFORE* opening
                // the moduleClient above?
                this.moduleTwin = await this.moduleClient.getTwin();
                this.moduleTwin.on('properties.desired', this.onHandleModuleProperties);

                this.moduleClient.on('error', this.onModuleClientError);

                this.moduleClient.onMethod(ModuleInterface.Command.RestartModule, this.restartModuleDirectMethod);
                this.moduleClient.onMethod(ModuleInterface.Command.AddCamera, this.addCameraDirectMethod);
                this.moduleClient.on('inputMessage', this.onHandleDownstreamMessages);

                const systemProperties = await this.getSystemProperties();
                const moduleProperties = await this.getModuleProperties();

                const deviceProperties = {
                    ...moduleProperties,
                    [AxisModuleProperties.OsName]: osPlatform() || '',
                    [AxisModuleProperties.SwVersion]: osRelease() || '',
                    [AxisModuleProperties.ProcessorArchitecture]: osArch() || '',
                    [AxisModuleProperties.TotalMemory]: systemProperties.totalMemory,
                    [ModuleInterface.Property.ModuleIpAddress]: this.moduleIpAddress
                };

                await this.updateModuleProperties(deviceProperties);

                await this.sendMeasurement({
                    [ModuleInterface.State.IoTCentralClientState]: IoTCentralClientState.Connected,
                    [ModuleInterface.State.ModuleState]: ModuleState.Active
                });
            }
            catch (ex) {
                connectionStatus = `IoT Central connection error: ${ex.message}`;
                this.logger.log(['ModuleService', 'error'], connectionStatus);

                result = false;
            }
        }

        return result;
    }

    @bind
    private async onHandleDownstreamMessages(inputName: string, message: any) {
        // this.logger.log(['ModuleService', 'info'], `Received downstream message: ${JSON.stringify(message, null, 4)}`);

        if (!this.moduleClient) {
            return;
        }

        try {
            await this.moduleClient.complete(message);

            const messageData = message.getBytes().toString('utf8');
            if (!messageData) {
                return;
            }

            const messageJson = JSON.parse(messageData);

            switch (inputName) {
                case AxisManagementEdgeInputs.CameraCommand: {
                    const edgeInputCameraCommand = _get(messageJson, 'command');
                    const edgeInputCameraCommandData = _get(messageJson, 'data');

                    switch (edgeInputCameraCommand) {
                        case AxisManagementCommands.CreateCamera:
                            await this.createAxisDevice(edgeInputCameraCommandData);
                            break;

                        case AxisManagementCommands.UpdateCamera:
                            await this.axisDeviceOperation('UPDATE_CAMERA', edgeInputCameraCommandData);
                            break;

                        case AxisManagementCommands.DeleteCamera:
                            await this.axisDeviceOperation('DELETE_CAMERA', edgeInputCameraCommandData);
                            break;

                        case AxisManagementCommands.SendDeviceTelemetry:
                            await this.axisDeviceOperation('SEND_TELEMETRY', edgeInputCameraCommandData);
                            break;

                        case AxisManagementCommands.SendDeviceInferences:
                            await this.axisDeviceOperation('SEND_INFERENCES', edgeInputCameraCommandData);
                            break;

                        default:
                            this.logger.log(['ModuleService', 'warning'], `Warning: received routed message for unknown input: ${inputName}`);
                            break;
                    }

                    break;
                }

                case AxisManagementEdgeInputs.LvaTelemetry:
                    break;

                default:
                    this.logger.log(['ModuleService', 'warning'], `Warning: received routed message for unknown input: ${inputName}`);
                    break;
            }
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error while handling downstream message: ${ex.message}`);
        }
    }

    private async createAxisDevice(deviceProps: IDeviceProps): Promise<IProvisionResult> {
        this.logger.log(['ModuleService', 'info'], `createAxisDevice with provisionInfo: ${JSON.stringify(deviceProps, null, 4)}`);

        let deviceProvisionResult: IProvisionResult = {
            dpsProvisionStatus: false,
            dpsProvisionMessage: '',
            dpsHubConnectionString: '',
            clientConnectionStatus: false,
            clientConnectionMessage: '',
            axisDevice: null
        };

        if (!this.moduleSettings.wpMasterDeviceProvisioningKey
            || !this.moduleSettings.wpScopeId
            || !this.moduleSettings.wpDeviceTemplateId
            || !this.moduleSettings.wpGatewayInstanceId
            || !this.moduleSettings.wpGatewayModuleId) {
            deviceProvisionResult.dpsProvisionStatus = false;
            deviceProvisionResult.dpsProvisionMessage = `Missing camera management settings (Master provision key, scopeId, deviceTemplateId, gatewayInstanceId, gatewayModuleId)`;
            this.logger.log(['ModuleService', 'error'], deviceProvisionResult.dpsProvisionMessage);

            return deviceProvisionResult;
        }

        try {
            const deviceKey = this.computeDeviceKey(deviceProps.cameraId, this.moduleSettings.wpMasterDeviceProvisioningKey);
            const dpsInfo: IDpsInfo = {
                scopeId: this.moduleSettings.wpScopeId,
                templateId: this.moduleSettings.wpDeviceTemplateId,
                iotcGatewayInstanceId: this.moduleSettings.wpGatewayInstanceId,
                iotcModuleId: this.moduleSettings.wpGatewayModuleId,
                deviceId: deviceProps.cameraId,
                deviceKey
            };

            deviceProvisionResult = await AxisDevice.createAndProvisionAxisDevice(this, dpsInfo, deviceProps);
            if (deviceProvisionResult.dpsProvisionStatus === true && deviceProvisionResult.clientConnectionStatus === true) {
                this.logger.log(['ModuleService', 'info'], `Succesfully provisioned device with id: ${deviceProps.cameraId}`);

                this.axisDeviceMap.set(deviceProps.cameraId, deviceProvisionResult.axisDevice);

                await this.sendMeasurement({ [ModuleInterface.Event.CreateCamera]: deviceProps.cameraId });
            }
        }
        catch (ex) {
            deviceProvisionResult.dpsProvisionStatus = false;
            deviceProvisionResult.dpsProvisionMessage = `Error while processing downstream message: ${ex.message}`;
            this.logger.log(['ModuleService', 'error'], deviceProvisionResult.dpsProvisionMessage);
        }

        return deviceProvisionResult;
    }

    private computeDeviceKey(deviceId: string, masterKey: string) {
        return crypto.createHmac('SHA256', Buffer.from(masterKey, 'base64')).update(deviceId, 'utf8').digest('base64');
    }

    private async axisDeviceOperation(deviceOperation: DeviceOperation, cameraOperationInfo: ICameraOperationInfo): Promise<IDeviceOperationResult> {
        this.logger.log(['ModuleService', 'info'], `Sending Axis telemetry: ${JSON.stringify(cameraOperationInfo, null, 4)}`);

        const operationResult = {
            status: false,
            message: ''
        };

        const cameraId = _get(cameraOperationInfo, 'cameraId');
        if (!cameraId) {
            operationResult.message = `Error: missing cameraId`;

            this.logger.log(['ModuleService', 'error'], operationResult.message);

            return operationResult;
        }

        const axisDevice = this.axisDeviceMap.get(cameraId);
        if (!axisDevice) {
            operationResult.message = `Error: Not device exists with cameraId: ${cameraId}`;

            this.logger.log(['ModuleService', 'error'], operationResult.message);

            return operationResult;
        }

        const operationInfo = _get(cameraOperationInfo, 'operationInfo');
        if (!operationInfo || emptyObj(operationInfo)) {
            operationResult.message = `Error: missing operationInfo data`;

            this.logger.log(['ModuleService', 'error'], operationResult.message);

            return operationResult;
        }

        switch (deviceOperation) {
            case 'UPDATE_CAMERA':
                await this.sendMeasurement({ [ModuleInterface.Event.UpdateCamera]: cameraId });

                await axisDevice.updateCamera(operationInfo);
                break;

            case 'DELETE_CAMERA':
                await this.sendMeasurement({ [ModuleInterface.Event.DeleteCamera]: cameraId });

                await axisDevice.deleteCamera();
                break;

            case 'SEND_TELEMETRY':
                await axisDevice.sendTelemetry(operationInfo);
                break;

            case 'SEND_INFERENCES':
                await axisDevice.processAxisInferences(operationInfo);
                break;

            default:
                this.logger.log(['ModuleService', 'error'], `Unkonwn device operation: ${deviceOperation}`);
                break;
        }

        return {
            status: true,
            message: `Success`
        };
    }

    @bind
    private onModuleClientError(error: Error) {
        this.logger.log(['ModuleService', 'error'], `Module client connection error: ${error.message}`);
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

            this.logger.log(['ModuleService', 'info'], `Module properties updated: ${JSON.stringify(properties, null, 4)}`);
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error updating module properties: ${ex.message}`);
        }
    }

    @bind
    private async onHandleModuleProperties(desiredChangedSettings: any) {
        this.logger.log(['ModuleService', 'info'], `desiredChangedSettings:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

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
                    case ModuleInterface.Setting.MasterDeviceProvisioningKey:
                    case ModuleInterface.Setting.ScopeId:
                    case ModuleInterface.Setting.DeviceTemplateId:
                    case ModuleInterface.Setting.GatewayInstanceId:
                    case ModuleInterface.Setting.GatewayModuleId:
                    case ModuleInterface.Setting.LvaEdgeModuleId:
                        changedSettingResult = await this.moduleSettingChange(moduleSettingsForPatching, desiredSettingsKey, _get(desiredChangedSettings, `${desiredSettingsKey}`));
                        break;

                    default:
                        this.logger.log(['ModuleService', 'error'], `Received desired property change for unknown setting '${desiredSettingsKey}'`);
                        break;
                }

                if (_get(changedSettingResult, 'status') === true) {
                    patchedProperties[desiredSettingsKey] = _get(changedSettingResult, 'value');
                }
            }
            catch (ex) {
                this.logger.log(['ModuleService', 'error'], `Exception while handling desired properties: ${ex.message}`);
            }
        }

        for (const moduleSettingsKey in moduleSettingsForPatching) {
            if (!moduleSettingsForPatching.hasOwnProperty(moduleSettingsKey)) {
                continue;
            }

            if (!moduleSettingsForPatching[moduleSettingsKey].handled) {
                this.logger.log(['ModuleService', 'info'], `Adding patched property '${moduleSettingsKey}' setting value to: '${this.moduleSettingsDefaults[moduleSettingsKey]}'`);
                patchedProperties[moduleSettingsKey] = this.moduleSettingsDefaults[moduleSettingsKey];
            }

            this.moduleSettings[moduleSettingsKey] = moduleSettingsForPatching[moduleSettingsKey].value;
        }

        if (!emptyObj(patchedProperties)) {
            await this.updateModuleProperties(patchedProperties);
        }
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
        this.logger.log(['ModuleService', 'info'], `Handle module setting change for '${setting}': ${typeof value === 'object' && value !== null ? JSON.stringify(value, null, 4) : value}`);

        const result = {
            value: undefined,
            status: true
        };

        switch (setting) {
            case ModuleInterface.Setting.MasterDeviceProvisioningKey:
            case ModuleInterface.Setting.ScopeId:
            case ModuleInterface.Setting.DeviceTemplateId:
            case ModuleInterface.Setting.GatewayInstanceId:
            case ModuleInterface.Setting.GatewayModuleId:
            case ModuleInterface.Setting.LvaEdgeModuleId:
                result.value = moduleSettingsForPatching[setting].value = value || '';
                moduleSettingsForPatching[setting].handled = true;
                break;

            default:
                this.logger.log(['ModuleService', 'info'], `Unknown module setting change request '${setting}'`);
                result.status = false;
        }

        return result;
    }

    @bind
    private async restartModuleDirectMethod(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.logger.log(['ModuleService', 'info'], `${ModuleInterface.Command.RestartModule} command received`);

        try {
            // sending response before processing, since this is a restart request
            await commandResponse.send(200, {
                statusCode: 201,
                message: 'Success'
            });

            const paramPayload = _get(commandRequest, 'payload');
            if (typeof paramPayload !== 'object') {
                throw new Error(`Missing or wrong payload time for command`);
            }

            await this.restartModule(_get(paramPayload, RestartModuleCommandRequestParams.Timeout) || 0, 'RestartModule command received');
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error sending response for ${ModuleInterface.Command.RestartModule} command: ${ex.message}`);
        }
    }

    @bind
    // @ts-ignore
    private async addCameraDirectMethod(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.logger.log(['ModuleService', 'info'], `${ModuleInterface.Command.AddCamera} command received`);

        try {
            const paramPayload = _get(commandRequest, 'payload');
            if (typeof paramPayload !== 'object') {
                throw new Error(`Missing or wrong payload time for command: ${ModuleInterface.Command.AddCamera}`);
            }

            const deviceProps = {
                cameraId: _get(paramPayload, AddCameraCommandRequestParams.CameraId),
                cameraName: _get(paramPayload, AddCameraCommandRequestParams.CameraName),
                rtspUrl: _get(paramPayload, AddCameraCommandRequestParams.RtspUrl),
                rtspAuthUsername: _get(paramPayload, AddCameraCommandRequestParams.RtspAuthUsername),
                rtspAuthPassword: _get(paramPayload, AddCameraCommandRequestParams.RtspAuthPassword),
                manufacturer: _get(paramPayload, AddCameraCommandRequestParams.Manufacturer),
                model: _get(paramPayload, AddCameraCommandRequestParams.Model)
            };

            const provisionResult = await this.createAxisDevice(deviceProps);

            const statusCode = (provisionResult.dpsProvisionStatus === true && provisionResult.clientConnectionStatus === true) ? 201 : 400;
            await commandResponse.send(statusCode, {
                statusCode,
                message: provisionResult.clientConnectionMessage
            });
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error creating Axis camera device: ${ex.message}`);

            await commandResponse.send(400, {
                statusCode: 400,
                message: ex.message
            });
        }
    }
}
