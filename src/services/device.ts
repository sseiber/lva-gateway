import { LoggingService } from './logging';
import { HealthState } from './health';
import {
    IDpsInfo,
    IProvisionResult
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
    deviceId: string;
    ipAddress: string;
    rtspUrl: string;
    manufacturer: string;
    model: string;
    swVersion: string;
    osName: string;
    processorArchitecture: string;
    processorManufacturer: string;
    totalStorage: string;
    totalMemory: string;
}

const AxisDeviceProperties = {
    Manufacturer: 'manufacturer',
    Model: 'model',
    SwVersion: 'swVersion',
    OsName: 'osName',
    ProcessorArchitecture: 'processorArchitecture',
    ProcessorManufacturer: 'processorManufacturer',
    TotalStorage: 'totalStorage',
    TotalMemory: 'totalMemory'
};

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

enum RestartCameraCommandParams {
    Timeout = 'cmpRestartCameraTimeout'
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
        CameraProvision: 'evCameraProvision',
        CameraProcessingStarted: 'evCameraProcessingStarted',
        CameraProcessingStopped: 'evCameraProcessingStopped',
        CameraRestart: 'evCameraRestart'
    },
    Setting: {
        DetectionClass: 'wpDetectionClass'
    },
    Property: {
        CameraIpAddress: 'rpCameraIpAddress',
        RtspUrl: 'rpRtspUrl'
    },
    Command: {
        RestartCamera: 'cmRestartCamera'
    }
};

const defaultDpsProvisioningHost: string = 'global.azure-devices-provisioning.net';

export class AxisDevice {
    public static async createAndProvisionAxisDevice(logger: LoggingService, dpsInfo: IDpsInfo, deviceProps: IDeviceProps): Promise<IProvisionResult> {
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

            deviceProvisionResult.axisDevice = new AxisDevice(logger, deviceProps);

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

    private logger: LoggingService;
    private deviceProps: IDeviceProps;
    private deviceClient: IoTDeviceClient = null;
    private deviceTwin: Twin = null;

    private healthState = HealthState.Good;
    private deviceSettings: IDeviceSettings = {
        wpDetectionClass: ''
    };
    private debugDeviceTelemetry: string = '';

    constructor(logger: LoggingService, deviceProps: IDeviceProps) {
        this.logger = logger;
        this.deviceProps = deviceProps;

        this.debugDeviceTelemetry = _get(process.env, 'DEBUG_DEVICE_TELEMETRY') || '';
    }

    public async sendTelemetry(telemetryData: any) {
        await this.sendMeasurement(telemetryData);
    }

    @bind
    public async getHealth(): Promise<number> {
        await this.sendMeasurement({
            [DeviceInterface.Telemetry.SystemHeartbeat]: this.healthState
        });

        return this.healthState;
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
                result.clientConnectionMessage = `Failed to connect device client interface from connection string - device: ${this.deviceProps.deviceId}`;
            }
            else {
                result.clientConnectionStatus = true;
                result.clientConnectionMessage = `Successfully connected to IoT Central - device: ${this.deviceProps.deviceId}`;
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

            this.deviceClient.onDeviceMethod(DeviceInterface.Command.RestartCamera, this.restartCameraDirectMethod);
            this.deviceClient.on('inputMessage', this.onHandleDownstreamMessages);

            await this.updateDeviceProperties({
                [DeviceInterface.Property.CameraIpAddress]: this.deviceProps.ipAddress,
                [DeviceInterface.Property.RtspUrl]: this.deviceProps.rtspUrl,
                [AxisDeviceProperties.Manufacturer]: this.deviceProps.manufacturer,
                [AxisDeviceProperties.Model]: this.deviceProps.model,
                [AxisDeviceProperties.OsName]: this.deviceProps.osName,
                [AxisDeviceProperties.SwVersion]: this.deviceProps.swVersion,
                [AxisDeviceProperties.ProcessorArchitecture]: this.deviceProps.processorArchitecture,
                [AxisDeviceProperties.ProcessorManufacturer]: this.deviceProps.processorManufacturer,
                [AxisDeviceProperties.TotalMemory]: this.deviceProps.totalMemory,
                [AxisDeviceProperties.TotalStorage]: this.deviceProps.totalStorage
            });

            await this.sendMeasurement({
                [DeviceInterface.State.IoTCentralClientState]: IoTCentralClientState.Connected,
                [DeviceInterface.State.CameraState]: CameraState.Active,
                [DeviceInterface.Event.CameraProcessingStarted]: 'Axis IoT Central Device'
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

            if (this.debugDeviceTelemetry === this.deviceProps.deviceId) {
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

                let changedSettingResult;

                switch (setting) {
                    case DeviceInterface.Setting.DetectionClass:
                        changedSettingResult = await this.deviceSettingChange(setting, _get(desiredChangedSettings, `${setting}`));
                        break;

                    default:
                        this.logger.log(['AxisDevice', 'error'], `Received desired property change for unknown setting '${setting}'`);
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
    private async restartCameraDirectMethod(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.logger.log(['AxisDevice', 'info'], `${DeviceInterface.Command.RestartCamera} command received`);

        try {
            await commandResponse.send(200);
        }
        catch (ex) {
            this.logger.log(['AxisDevice', 'error'], `Error sending response for ${DeviceInterface.Command.RestartCamera} command: ${ex.message}`);
        }

        const timeout = _get(commandRequest, `payload.${RestartCameraCommandParams.Timeout}`);

        try {
            await this.sendMeasurement({
                [DeviceInterface.Event.CameraRestart]: 'DirectMethod called for camera restart',
                [DeviceInterface.Event.CameraProcessingStopped]: 'Axis IoT Central Device',
                [DeviceInterface.State.CameraState]: CameraState.Inactive
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
            this.logger.log(['AxisDevice', 'error'], `${ex.message}`);
        }
    }
}
