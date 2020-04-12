import { LoggingService } from './logging';
import { HealthState } from './health';
import {
    IDpsInfo,
    IProvisionResult,
    ICommandResponseParams,
    ModuleService
} from './module';
import { Mqtt as IoTHubTransport } from 'azure-iot-device-mqtt';
import {
    DeviceMethodRequest,
    DeviceMethodResponse,
    Client as IoTDeviceClient,
    Twin,
    Message as IoTMessage
} from 'azure-iot-device';
import { SymmetricKeySecurityClient } from 'azure-iot-security-symmetric-key';
import { ProvisioningDeviceClient } from 'azure-iot-provisioning-device';
import { Mqtt as ProvisioningTransport } from 'azure-iot-provisioning-device-mqtt';
import * as _get from 'lodash.get';
import { bind, emptyObj } from '../utils';

export interface IDeviceProps {
    cameraId: string;
    cameraName: string;
    rtspUrl: string;
    rtspAuthUsername: string;
    rtspAuthPassword: string;
    manufacturer: string;
    model: string;
}

export interface IInference {
    cameraId: string;
    className: string;
    confidence: number;
    roi: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
}

interface IDeviceSettings {
    wpDetectionClass: string;
}

enum IoTCentralClientState {
    Disconnected = 'disconnected',
    Connected = 'connected'
}

enum CameraState {
    Inactive = 'inactive',
    Active = 'active'
}

const DeviceInterface = {
    Telemetry: {
        SystemHeartbeat: 'tlSystemHeartbeat',
        InferenceCount: 'tlInferenceCount',
        Inference: 'tlInference'
    },
    State: {
        IoTCentralClientState: 'stIoTCentralClientState',
        CameraState: 'stCameraState'
    },
    Event: {
        CreateCamera: 'evCreateCamera',
        UpdateCamera: 'evUpdateCamera',
        CameraProcessingStarted: 'evCameraProcessingStarted',
        CameraProcessingStopped: 'evCameraProcessingStopped',
        StartLva: 'evStartLva',
        CameraSnippet: 'evCameraSnippet'
    },
    Setting: {
        DetectionClass: 'wpDetectionClass'
    },
    Property: {
        CameraName: 'rpCameraName',
        RtspUrl: 'rpRtspUrl',
        RtspAuthUsername: 'rpRtspAuthUsername',
        RtspAuthPassword: 'rpRtspAuthPassword',
        Manufacturer: 'rpManufacturer',
        Model: 'rpModel'
    },
    Command: {
        StartLva: 'cmStartLva',
        RecordCameraSnippet: 'cmRecordCameraSnippet'
    }
};

const defaultDpsProvisioningHost: string = 'global.azure-devices-provisioning.net';

export class AxisDevice {
    public static async createAndProvisionAxisDevice(axisCameraManagementModule: ModuleService, dpsInfo: IDpsInfo, deviceProps: IDeviceProps): Promise<IProvisionResult> {
        const logger = axisCameraManagementModule.getLogger();

        logger.log(['AxisDevice', 'info'], `Provisioning new device - id: ${dpsInfo.deviceId}, key: ${dpsInfo.deviceKey}`);

        const deviceProvisionResult: IProvisionResult = {
            dpsProvisionStatus: false,
            dpsProvisionMessage: '',
            dpsHubConnectionString: '',
            clientConnectionStatus: false,
            clientConnectionMessage: '',
            axisDevice: null
        };

        try {
            if (!dpsInfo.deviceId || !dpsInfo.deviceKey) {
                deviceProvisionResult.dpsProvisionStatus = false;
                deviceProvisionResult.dpsProvisionMessage = `Missing device configuration - skipping DPS provisioning`;

                logger.log(['AxisDevice', 'warning'], deviceProvisionResult.dpsProvisionMessage);

                return deviceProvisionResult;
            }

            const dpsProvisioningHost = process.env.dpsProvisioningHost || defaultDpsProvisioningHost;
            const provisioningSecurityClient = new SymmetricKeySecurityClient(dpsInfo.deviceId, dpsInfo.deviceKey);
            const provisioningClient = ProvisioningDeviceClient.create(dpsProvisioningHost, dpsInfo.scopeId, new ProvisioningTransport(), provisioningSecurityClient);

            provisioningClient.setProvisioningPayload({
                iotcModelId: dpsInfo.templateId,
                iotcGateway: {
                    iotcGatewayId: dpsInfo.iotcGatewayId,
                    iotcModuleId: dpsInfo.iotcModuleId
                }
            });

            const dpsConnectionString = await new Promise<string>((resolve, reject) => {
                provisioningClient.register((dpsError, dpsResult) => {
                    if (dpsError) {
                        return reject(dpsError);
                    }

                    logger.log(['AxisDevice', 'info'], `DPS registration succeeded - hub: ${dpsResult.assignedHub}`);

                    return resolve(`HostName=${dpsResult.assignedHub};DeviceId=${dpsResult.deviceId};SharedAccessKey=${dpsInfo.deviceKey}`);
                });
            });

            deviceProvisionResult.dpsProvisionStatus = true;
            deviceProvisionResult.dpsProvisionMessage = `IoT Central successfully provisioned device: ${dpsInfo.deviceId}`;
            deviceProvisionResult.dpsHubConnectionString = dpsConnectionString;

            deviceProvisionResult.axisDevice = new AxisDevice(axisCameraManagementModule, deviceProps);

            const { clientConnectionStatus, clientConnectionMessage } = await deviceProvisionResult.axisDevice.connectDeviceClient(deviceProvisionResult.dpsHubConnectionString);
            deviceProvisionResult.clientConnectionStatus = clientConnectionStatus;
            deviceProvisionResult.clientConnectionMessage = clientConnectionMessage;
        }
        catch (ex) {
            deviceProvisionResult.dpsProvisionStatus = false;
            deviceProvisionResult.dpsProvisionMessage = `Error while provisioning device: ${ex.message}`;

            logger.log(['AxisDevice', 'error'], deviceProvisionResult.dpsProvisionMessage);
        }

        return deviceProvisionResult;
    }

    private axisCameraManagementModule: ModuleService;
    private logger: LoggingService;
    private deviceProps: IDeviceProps;
    private deviceClient: IoTDeviceClient = null;
    private deviceTwin: Twin = null;

    private healthState = HealthState.Good;
    private deviceSettings: IDeviceSettings = {
        wpDetectionClass: ''
    };

    constructor(axisCameraMangementModule: ModuleService, deviceProps: IDeviceProps) {
        this.axisCameraManagementModule = axisCameraMangementModule;
        this.logger = axisCameraMangementModule.getLogger();
        this.deviceProps = deviceProps;
    }

    @bind
    public async getHealth(): Promise<number> {
        await this.sendMeasurement({
            [DeviceInterface.Telemetry.SystemHeartbeat]: this.healthState
        });

        return this.healthState;
    }

    public async updateCamera(deviceProps: any): Promise<void> {
        this.logger.log(['AxisDevice', 'info'], `Updating camera properties for cameraId: ${this.deviceProps.cameraId}`);

        this.deviceProps = {
            ...deviceProps
        };

        await this.updateDeviceProperties({
            [DeviceInterface.Property.CameraName]: this.deviceProps.cameraName,
            [DeviceInterface.Property.RtspUrl]: this.deviceProps.rtspUrl,
            [DeviceInterface.Property.RtspAuthUsername]: this.deviceProps.rtspAuthUsername,
            [DeviceInterface.Property.RtspAuthPassword]: this.deviceProps.rtspAuthPassword,
            [DeviceInterface.Property.Manufacturer]: this.deviceProps.manufacturer,
            [DeviceInterface.Property.Model]: this.deviceProps.model
        });

        await this.sendMeasurement({
            [DeviceInterface.Event.UpdateCamera]: this.deviceProps.cameraId
        });
    }

    public async deleteCamera(): Promise<void> {
        this.logger.log(['AxisDevice', 'info'], `Deleting camera camera device instance for cameraId: ${this.deviceProps.cameraId}`);

        await this.sendMeasurement({
            [DeviceInterface.Event.CameraProcessingStopped]: 'Axis IoT Central Device',
            [DeviceInterface.State.CameraState]: CameraState.Inactive
        });
    }

    public async sendTelemetry(telemetryData: any): Promise<void> {
        return this.sendMeasurement(telemetryData);
    }

    public async processAxisInferences(inferences: IInference[]): Promise<void> {
        if (!inferences || !Array.isArray(inferences) || !this.deviceClient) {
            this.logger.log(['AxisDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        if (_get(process.env, 'DEBUG_DEVICE_TELEMETRY') === this.deviceProps.cameraId) {
            this.logger.log(['AxisDevice', 'info'], `processAxisInferences: ${inferences}`);
        }

        try {
            let inferenceCount = 0;

            for (const inference of inferences) {
                if (inference.className.toUpperCase() === this.deviceSettings.wpDetectionClass.toUpperCase()) {
                    ++inferenceCount;
                    await this.sendMeasurement({
                        [DeviceInterface.Telemetry.Inference]: inference
                    });
                }
            }

            if (inferenceCount > 0) {
                await this.sendMeasurement({
                    [DeviceInterface.Telemetry.InferenceCount]: inferenceCount
                });
            }
        }
        catch (ex) {
            this.logger.log(['AxisDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    private async connectDeviceClient(dpsHubConnectionString: string): Promise<any> {
        const result = {
            clientConnectionStatus: false,
            clientConnectionMessage: ''
        };

        if (this.deviceClient) {
            await this.deviceClient.close();
            this.deviceClient = null;
        }

        try {
            this.deviceClient = await IoTDeviceClient.fromConnectionString(dpsHubConnectionString, IoTHubTransport);
            if (!this.deviceClient) {
                result.clientConnectionStatus = false;
                result.clientConnectionMessage = `Failed to connect device client interface from connection string - device: ${this.deviceProps.cameraId}`;
            }
            else {
                result.clientConnectionStatus = true;
                result.clientConnectionMessage = `Successfully connected to IoT Central - device: ${this.deviceProps.cameraId}`;
            }
        }
        catch (ex) {
            result.clientConnectionStatus = false;
            result.clientConnectionMessage = `Failed to instantiate client interface from configuraiton: ${ex.message}`;

            this.logger.log(['AxisDevice', 'error'], `${result.clientConnectionMessage}`);
        }

        if (result.clientConnectionStatus === false) {
            return result;
        }

        try {
            await this.deviceClient.open();

            this.logger.log(['AxisDevice', 'info'], `Device client is connected`);

            this.deviceTwin = await this.deviceClient.getTwin();
            this.deviceTwin.on('properties.desired', this.onHandleDeviceProperties);

            this.deviceClient.on('error', this.onDeviceClientError);

            this.deviceClient.onDeviceMethod(DeviceInterface.Command.StartLva, this.startLva);
            this.deviceClient.onDeviceMethod(DeviceInterface.Command.RecordCameraSnippet, this.recordCameraSnippetDirectMethod);
            this.deviceClient.on('inputMessage', this.onHandleDownstreamMessages);

            await this.updateDeviceProperties({
                [DeviceInterface.Property.CameraName]: this.deviceProps.cameraName,
                [DeviceInterface.Property.RtspUrl]: this.deviceProps.rtspUrl,
                [DeviceInterface.Property.RtspAuthUsername]: this.deviceProps.rtspAuthUsername,
                [DeviceInterface.Property.RtspAuthPassword]: this.deviceProps.rtspAuthPassword,
                [DeviceInterface.Property.Manufacturer]: this.deviceProps.manufacturer,
                [DeviceInterface.Property.Model]: this.deviceProps.model
            });

            await this.sendMeasurement({
                [DeviceInterface.State.IoTCentralClientState]: IoTCentralClientState.Connected,
                [DeviceInterface.State.CameraState]: CameraState.Active,
                [DeviceInterface.Event.CameraProcessingStarted]: this.deviceProps.cameraId,
                [DeviceInterface.Event.CreateCamera]: this.deviceProps.cameraId
            });

            result.clientConnectionStatus = true;
        }
        catch (ex) {
            result.clientConnectionStatus = false;
            result.clientConnectionMessage = `IoT Central connection error: ${ex.message}`;

            this.logger.log(['AxisDevice', 'error'], result.clientConnectionMessage);
        }

        return result;
    }

    @bind
    private async sendMeasurement(data: any): Promise<void> {
        if (!data || !this.deviceClient) {
            return;
        }

        try {
            const iotcMessage = new IoTMessage(JSON.stringify(data));

            await this.deviceClient.sendEvent(iotcMessage);

            if (_get(process.env, 'DEBUG_DEVICE_TELEMETRY') === this.deviceProps.cameraId) {
                this.logger.log(['AxisDevice', 'info'], `sendEvent: ${JSON.stringify(data, null, 4)}`);
            }
        }
        catch (ex) {
            this.logger.log(['AxisDevice', 'error'], `sendMeasurement: ${ex.message}`);
        }
    }

    private async updateDeviceProperties(properties: any): Promise<void> {
        if (!properties || !this.deviceTwin) {
            return;
        }

        try {
            await new Promise((resolve, reject) => {
                this.deviceTwin.properties.reported.update(properties, (error) => {
                    if (error) {
                        return reject(error);
                    }

                    return resolve();
                });
            });

            this.logger.log(['AxisDevice', 'info'], `Device live properties updated: ${JSON.stringify(properties, null, 4)}`);
        }
        catch (ex) {
            this.logger.log(['AxisDevice', 'error'], `Error while updating client properties: ${ex.message}`);
        }
    }

    @bind
    private async onHandleDeviceProperties(desiredChangedSettings: any) {
        try {
            this.logger.log(['AxisDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

            const patchedProperties = {};

            for (const setting in desiredChangedSettings) {
                if (!desiredChangedSettings.hasOwnProperty(setting)) {
                    continue;
                }

                if (setting === '$version') {
                    continue;
                }

                const value = _get(desiredChangedSettings, `${setting}.value`);
                if (!value) {
                    this.logger.log(['AxisDevice', 'error'], `No value field found for desired property '${setting}'`);
                    continue;
                }

                let changedSettingResult;

                switch (setting) {
                    case DeviceInterface.Setting.DetectionClass:
                        changedSettingResult = await this.deviceSettingChange(setting, value);
                        break;

                    default:
                        this.logger.log(['AxisDevice', 'warning'], `Received desired property change for unknown setting '${setting}'`);
                        break;
                }

                if (_get(changedSettingResult, 'status') === true) {
                    patchedProperties[setting] = changedSettingResult.value;
                }
            }

            if (!emptyObj(patchedProperties)) {
                await this.updateDeviceProperties(patchedProperties);
            }
        }
        catch (ex) {
            this.logger.log(['AxisDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }
    }

    private async deviceSettingChange(setting: string, value: any): Promise<any> {
        this.logger.log(['AxisDevice', 'info'], `Handle device setting change for '${setting}': ${typeof value === 'object' && value !== null ? JSON.stringify(value, null, 4) : value}`);

        const result = {
            value: undefined,
            status: true
        };

        switch (setting) {
            case DeviceInterface.Setting.DetectionClass:
                result.value = this.deviceSettings[setting] = value || '';
                break;

            default:
                this.logger.log(['AxisDevice', 'info'], `Unknown device setting change request '${setting}'`);
                result.status = false;
        }

        return result;
    }

    @bind
    private async onHandleDownstreamMessages(inputName: string, message: any) {
        // this.logger.log(['AxisDevice', 'info'], `Received downstream message: ${JSON.stringify(message, null, 4)}`);

        if (!this.deviceClient) {
            return;
        }

        try {
            await this.deviceClient.complete(message);

            const messageData = message.getBytes().toString('utf8');
            if (!messageData) {
                return;
            }

            const messageJson = JSON.parse(messageData);

            switch (inputName) {
                case 'axisdevicetelemetry':
                    this.logger.log(['AxisDevice', 'info'], `Received routed message - inputName: ${inputName}, message: ${JSON.stringify(messageJson, null, 4)}`);
                    break;

                default:
                    this.logger.log(['AxisDevice', 'warning'], `Warning: received routed message for unknown input: ${inputName}`);
                    break;
            }
        }
        catch (ex) {
            this.logger.log(['AxisDevice', 'error'], `Error while handling downstream message: ${ex.message}`);
        }
    }

    @bind
    private onDeviceClientError(error: Error) {
        this.logger.log(['AxisDevice', 'error'], `Device client connection error: ${error.message}`);
        this.healthState = HealthState.Critical;
    }

    @bind
    private async startLva(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.logger.log(['AxisDevice', 'info'], `${DeviceInterface.Command.StartLva} command received`);

        let cameraSnippetResponse: ICommandResponseParams = {
            statusCode: 201,
            message: 'Succeeded'
        };

        try {
            await this.sendMeasurement({
                [DeviceInterface.Event.StartLva]: 'DirectMethod called to start LVA'
            });

            const graphName;

            cameraSnippetResponse = await this.axisCameraManagementModule.startLva(graphName);
        }
        catch (ex) {
            cameraSnippetResponse = {
                statusCode: 400,
                message: ex.message
            };

            this.logger.log(['AxisDevice', 'error'], `${ex.message}`);
        }

        await commandResponse.send(cameraSnippetResponse.statusCode, cameraSnippetResponse);
    }

    @bind
    // @ts-ignore
    private async recordCameraSnippetDirectMethod(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.logger.log(['AxisDevice', 'info'], `${DeviceInterface.Command.RecordCameraSnippet} command received`);

        let cameraSnippetResponse: ICommandResponseParams = {
            statusCode: 201,
            message: 'Succeeded'
        };

        try {
            await this.sendMeasurement({
                [DeviceInterface.Event.CameraSnippet]: 'DirectMethod called for camera snippet'
            });

            const cameraInfo = {
                cameraName: 'Scotts Nook Camera',
                cameraId: 'Axis1367'
            };

            cameraSnippetResponse = await this.axisCameraManagementModule.recordFromCamera(cameraInfo);
        }
        catch (ex) {
            cameraSnippetResponse = {
                statusCode: 400,
                message: ex.message
            };

            this.logger.log(['AxisDevice', 'error'], `${ex.message}`);
        }

        await commandResponse.send(cameraSnippetResponse.statusCode, cameraSnippetResponse);
    }
}
