import { HealthState } from './health';
import { Mqtt as IoTHubTransport } from 'azure-iot-device-mqtt';
import {
    DeviceMethodRequest,
    DeviceMethodResponse,
    Client as IoTDeviceClient,
    Twin,
    Message as IoTMessage
} from 'azure-iot-device';
import {
    ICommandResponse,
    ModuleService,
    IAmsGraph
} from './module';
import { bind, defer, emptyObj } from '../utils';

export type DevicePropertiesHandler = (desiredChangedSettings: any) => Promise<void>;

export interface IClientConnectResult {
    clientConnectionStatus: boolean;
    clientConnectionMessage: string;
}

interface ICameraProps {
    rpManufacturer: string;
    rpModel: string;
}

enum IoTCentralClientState {
    Disconnected = 'disconnected',
    Connected = 'connected'
}

enum CameraState {
    Inactive = 'inactive',
    Active = 'active'
}

const LvaInterface = {
    Event: {
        GraphInstanceCreated: 'evGraphInstanceCreated',
        GraphInstanceDeleted: 'evGraphInstanceDeleted',
        GraphInstanceStarted: 'evGraphInstanceStarted',
        GraphInstanceStopped: 'evGraphInstanceStopped',
        MediaRecordingStarted: 'evMediaRecordingStarted',
        StartLvaGraphCommandReceived: 'evStartLvaGraphCommandReceived',
        StopLvaGraphCommandReceived: 'evStopLvaGraphCommandReceived'
    },
    Command: {
        StartLvaProcessing: 'cmStartLvaProcessing',
        StopLvaProcessing: 'cmStopLvaProcessing'
    }
};

export enum IoTCameraDeviceSettings {
    RtspUrl = 'wpRtspUrl',
    RtspAuthUsername = 'wpRtspAuthUsername',
    RtspAuthPassword = 'wpRtspAuthPassword',
    AutoStart = 'wpAutoStart',
    DebugTelemetry = 'wpDebugTelemetry'
}

interface IIoTCameraDeviceSettings {
    [IoTCameraDeviceSettings.RtspUrl]: string;
    [IoTCameraDeviceSettings.RtspAuthUsername]: string;
    [IoTCameraDeviceSettings.RtspAuthPassword]: string;
    [IoTCameraDeviceSettings.AutoStart]: boolean;
    [IoTCameraDeviceSettings.DebugTelemetry]: boolean;
}

export const AmsDeviceTag = 'rpAmsDeviceTag';
export const AmsDeviceTagValue = 'AmsInferenceDevice.v1';

const IoTCameraDeviceInterface = {
    Telemetry: {
        SystemHeartbeat: 'tlSystemHeartbeat'
    },
    State: {
        IoTCentralClientState: 'stIoTCentralClientState',
        CameraState: 'stCameraState'
    },
    Property: {
        CameraName: 'rpCameraName',
        Manufacturer: 'rpManufacturer',
        Model: 'rpModel',
        AmsDeviceTag
    },
    Setting: {
        RtspUrl: IoTCameraDeviceSettings.RtspUrl,
        RtspAuthUsername: IoTCameraDeviceSettings.RtspAuthUsername,
        RtspAuthPassword: IoTCameraDeviceSettings.RtspAuthPassword,
        AutoStart: IoTCameraDeviceSettings.AutoStart,
        DebugTelemetry: IoTCameraDeviceSettings.DebugTelemetry
    }
};

export abstract class AmsCameraDevice {
    protected lvaGatewayModule: ModuleService;
    protected amsGraph: IAmsGraph;
    protected cameraId: string = '';
    protected cameraName: string = '';
    protected deviceClient: IoTDeviceClient;
    protected deviceTwin: Twin;

    protected deferredStart = defer();
    protected healthState = HealthState.Good;
    protected deviceSettings: IIoTCameraDeviceSettings = {
        [IoTCameraDeviceSettings.RtspUrl]: '',
        [IoTCameraDeviceSettings.RtspAuthUsername]: '',
        [IoTCameraDeviceSettings.RtspAuthPassword]: '',
        [IoTCameraDeviceSettings.AutoStart]: false,
        [IoTCameraDeviceSettings.DebugTelemetry]: false
    };

    constructor(lvaGatewayModule: ModuleService, amsGraph: IAmsGraph, cameraId: string, cameraName: string) {
        this.lvaGatewayModule = lvaGatewayModule;
        this.amsGraph = amsGraph;
        this.cameraId = cameraId;
        this.cameraName = cameraName;
    }

    public abstract async connectDeviceClient(dpsHubConnectionString: string): Promise<IClientConnectResult>;
    public abstract setGraphInstance(amsGraph: IAmsGraph): boolean;
    public abstract async processLvaInferences(inferenceData: any): Promise<void>;

    @bind
    public async getHealth(): Promise<number> {
        await this.sendMeasurement({
            [IoTCameraDeviceInterface.Telemetry.SystemHeartbeat]: this.healthState
        });

        return this.healthState;
    }

    public async deleteCamera(): Promise<void> {
        this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `Deleting camera camera device instance for cameraId: ${this.cameraId}`);

        await this.sendMeasurement({
            [IoTCameraDeviceInterface.State.CameraState]: CameraState.Inactive
        });
    }

    public async sendTelemetry(telemetryData: any): Promise<void> {
        return this.sendMeasurement(telemetryData);
    }

    protected async connectDeviceClientInternal(
        dpsHubConnectionString: string,
        devicePropertiesHandler: DevicePropertiesHandler): Promise<IClientConnectResult> {

        const result: IClientConnectResult = {
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
                result.clientConnectionMessage = `Failed to connect device client interface from connection string - device: ${this.cameraId}`;
            }
            else {
                result.clientConnectionStatus = true;
                result.clientConnectionMessage = `Successfully connected to IoT Central - device: ${this.cameraId}`;
            }
        }
        catch (ex) {
            result.clientConnectionStatus = false;
            result.clientConnectionMessage = `Failed to instantiate client interface from configuraiton: ${ex.message}`;

            this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], `${result.clientConnectionMessage}`);
        }

        if (result.clientConnectionStatus === false) {
            return result;
        }

        try {
            await this.deviceClient.open();

            this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `Device client is connected`);

            this.deviceTwin = await this.deviceClient.getTwin();
            this.deviceTwin.on('properties.desired', devicePropertiesHandler);

            this.deviceClient.on('error', this.onDeviceClientError);

            this.deviceClient.onDeviceMethod(LvaInterface.Command.StartLvaProcessing, this.startLvaProcessing);
            this.deviceClient.onDeviceMethod(LvaInterface.Command.StopLvaProcessing, this.stopLvaProcessing);

            const cameraProps = await this.getCameraProps();

            await this.updateDeviceProperties({
                [IoTCameraDeviceInterface.Property.CameraName]: this.cameraName,
                [IoTCameraDeviceInterface.Property.Manufacturer]: cameraProps.rpManufacturer,
                [IoTCameraDeviceInterface.Property.Model]: cameraProps.rpModel,
                [IoTCameraDeviceInterface.Property.AmsDeviceTag]: AmsDeviceTagValue
            });

            await this.sendMeasurement({
                [IoTCameraDeviceInterface.State.IoTCentralClientState]: IoTCentralClientState.Connected,
                [IoTCameraDeviceInterface.State.CameraState]: CameraState.Inactive
            });

            result.clientConnectionStatus = true;
        }
        catch (ex) {
            result.clientConnectionStatus = false;
            result.clientConnectionMessage = `IoT Central connection error: ${ex.message}`;

            this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], result.clientConnectionMessage);
        }

        return result;
    }

    protected async onHandleDeviceProperties(desiredChangedSettings: any) {
        try {
            this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

            const patchedProperties = {};

            for (const setting in desiredChangedSettings) {
                if (!desiredChangedSettings.hasOwnProperty(setting)) {
                    continue;
                }

                if (setting === '$version') {
                    continue;
                }

                const value = desiredChangedSettings[`${setting}`]?.value;

                switch (setting) {
                    case IoTCameraDeviceInterface.Setting.RtspUrl:
                    case IoTCameraDeviceInterface.Setting.RtspAuthUsername:
                    case IoTCameraDeviceInterface.Setting.RtspAuthPassword:
                        patchedProperties[setting] = (this.deviceSettings[setting] as any) = value || '';
                        break;

                    case IoTCameraDeviceInterface.Setting.AutoStart:
                    case IoTCameraDeviceInterface.Setting.DebugTelemetry:
                        patchedProperties[setting] = (this.deviceSettings[setting] as any) = value || false;

                    default:
                        break;
                }
            }

            if (!emptyObj(patchedProperties)) {
                await this.updateDeviceProperties(patchedProperties);
            }
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }
    }

    protected async updateDeviceProperties(properties: any): Promise<void> {
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

            this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `Device live properties updated: ${JSON.stringify(properties, null, 4)}`);
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], `Error while updating client properties: ${ex.message}`);
        }
    }

    protected async sendMeasurement(data: any): Promise<void> {
        if (!data || !this.deviceClient) {
            return;
        }

        try {
            const iotcMessage = new IoTMessage(JSON.stringify(data));

            await this.deviceClient.sendEvent(iotcMessage);

            if (this.deviceSettings[IoTCameraDeviceSettings.DebugTelemetry] === true) {
                this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `sendEvent: ${JSON.stringify(data, null, 4)}`);
            }
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], `sendMeasurement: ${ex.message}`);
            this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], `inspect the error: ${JSON.stringify(ex, null, 4)}`);

            // TODO:
            // Detect DPS/Hub reprovisioning scenarios - sample exeption:
            //
            // [12:41:54 GMT+0000], [log,[AmsCameraDevice, error]] data: inspect the error: {
            //     "name": "UnauthorizedError",
            //     "transportError": {
            //         "name": "NotConnectedError",
            //         "transportError": {
            //             "code": 5
            //         }
            //     }
            // }
        }
    }

    protected async startLvaProcessingInternal(): Promise<ICommandResponse> {
        await this.sendMeasurement({
            [LvaInterface.Event.StartLvaGraphCommandReceived]: this.cameraId
        });

        await this.lvaGatewayModule.stopLvaGraph(this.amsGraph);

        this.setGraphInstance(this.amsGraph);

        const startLvaGraphResponse = await this.lvaGatewayModule.startLvaGraph(this.amsGraph);
        this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `LVA Edge gateway returned with status: ${startLvaGraphResponse.statusCode}`);

        if (startLvaGraphResponse?.statusCode === 201) {
            await this.sendMeasurement({
                [IoTCameraDeviceInterface.State.CameraState]: CameraState.Active
            });
        }

        return startLvaGraphResponse;
    }

    private async getCameraProps(): Promise<ICameraProps> {
        // TODO:
        // Introduce some ONVIF tech to get camera props
        return {
            rpManufacturer: 'Acme',
            rpModel: 'Illudium Q-36'
        };
    }

    @bind
    private onDeviceClientError(error: Error) {
        this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], `Device client connection error: ${error.message}`);
        this.healthState = HealthState.Critical;
    }

    @bind
    // @ts-ignore
    private async startLvaProcessing(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `${LvaInterface.Command.StartLvaProcessing} command received`);

        try {
            const startLvaGraphResponse = await this.startLvaProcessingInternal();

            await commandResponse.send(startLvaGraphResponse.statusCode, startLvaGraphResponse);
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], `startLvaProcessing error: ${ex.message}`);

            await commandResponse.send(400, {
                statusCode: 400,
                message: ex.message
            });
        }
    }

    @bind
    // @ts-ignore
    private async stopLvaProcessing(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `${LvaInterface.Command.StopLvaProcessing} command received`);

        try {
            await this.sendMeasurement({
                [LvaInterface.Event.StopLvaGraphCommandReceived]: this.cameraId
            });

            const stopLvaGraphResponse = await this.lvaGatewayModule.stopLvaGraph(this.amsGraph);
            this.lvaGatewayModule.log(['AmsCameraDevice', 'info'], `LVA edge gateway returned with status: ${stopLvaGraphResponse.statusCode}`);

            if (stopLvaGraphResponse?.statusCode === 201) {
                await this.sendMeasurement({
                    [IoTCameraDeviceInterface.State.CameraState]: CameraState.Inactive
                });
            }

            await commandResponse.send(stopLvaGraphResponse.statusCode, stopLvaGraphResponse);
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsCameraDevice', 'error'], `Stop LVA error ${ex.message}`);

            await commandResponse.send(400, {
                statusCode: 400,
                message: ex.message
            });
        }
    }
}
