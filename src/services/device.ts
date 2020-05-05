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
    ICameraDeviceProvisionInfo,
    ModuleService,
    AmsGraph
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
    AutoStart = 'wpAutoStart',
    DebugTelemetry = 'wpDebugTelemetry'
}

interface IIoTCameraDeviceSettings {
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
        RtspUrl: 'rpRtspUrl',
        RtspAuthUsername: 'rpRtspAuthUsername',
        RtspAuthPassword: 'rpRtspAuthPassword',
        Manufacturer: 'rpManufacturer',
        Model: 'rpModel',
        AmsDeviceTag
    },
    Setting: {
        AutoStart: IoTCameraDeviceSettings.AutoStart,
        DebugTelemetry: IoTCameraDeviceSettings.DebugTelemetry
    }
};

export abstract class AmsCameraDevice {
    protected id: string;
    protected lvaGatewayModule: ModuleService;
    protected amsGraph: AmsGraph;
    protected cameraInfo: ICameraDeviceProvisionInfo;
    protected deviceClient: IoTDeviceClient;
    protected deviceTwin: Twin;

    protected deferredStart = defer();
    protected healthState = HealthState.Good;
    protected deviceSettings: IIoTCameraDeviceSettings = {
        [IoTCameraDeviceSettings.AutoStart]: false,
        [IoTCameraDeviceSettings.DebugTelemetry]: false
    };

    constructor(lvaGatewayModule: ModuleService, amsGraph: AmsGraph, cameraInfo: ICameraDeviceProvisionInfo) {
        this.id = (Math.floor(100000 + Math.random() * 900000)).toString();
        this.lvaGatewayModule = lvaGatewayModule;
        this.amsGraph = amsGraph;
        this.cameraInfo = cameraInfo;
    }

    public abstract async initDevice(): Promise<void>;
    public abstract async processLvaInferences(inferenceData: any): Promise<void>;

    public getId() {
        return this.id;
    }

    public async connectDeviceClient(dpsHubConnectionString: string): Promise<IClientConnectResult> {
        let clientConnectionResult: IClientConnectResult = {
            clientConnectionStatus: false,
            clientConnectionMessage: ''
        };

        try {
            clientConnectionResult = await this.connectDeviceClientInternal(dpsHubConnectionString, this.onHandleDeviceProperties);

            if (clientConnectionResult.clientConnectionStatus === true) {
                await this.initDevice();

                await this.deferredStart.promise;
            }

            if (this.deviceSettings[IoTCameraDeviceSettings.AutoStart] === true) {
                try {
                    await this.startLvaProcessingInternal(true);
                }
                catch (ex) {
                    this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `Error while trying to auto-start Lva graph: ${ex.message}`);
                }
            }
        }
        catch (ex) {
            clientConnectionResult.clientConnectionStatus = false;
            clientConnectionResult.clientConnectionMessage = `An error occurred while accessing the device twin properties`;
        }

        return clientConnectionResult;
    }

    @bind
    public async getHealth(): Promise<number> {
        await this.sendMeasurement({
            [IoTCameraDeviceInterface.Telemetry.SystemHeartbeat]: this.healthState
        });

        return this.healthState;
    }

    public async deleteCamera(): Promise<void> {
        this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `Deleting camera device instance for cameraId: ${this.cameraInfo.cameraId}`);

        try {
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `Deactiving graph instance: ${this.amsGraph.getInstanceName()}`);

            const clientInterface = this.deviceClient;
            this.deviceClient = null;
            await clientInterface.close();

            await this.sendMeasurement({
                [IoTCameraDeviceInterface.State.CameraState]: CameraState.Inactive
            });

            await this.amsGraph.deleteLvaGraph();
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `Error while deleting camera: ${this.cameraInfo.cameraId}`);
        }
    }

    public async sendLvaEvent(lvaEvent: string): Promise<void> {
        switch (lvaEvent) {
            case 'Microsoft.Media.Graph.Diagnostics.MediaSessionEstablished':
                return this.sendMeasurement({
                    [LvaInterface.Event.MediaRecordingStarted]: this.cameraInfo.cameraId
                });

                break;

            default:
                this.lvaGatewayModule.logger(['AmsCameraDevice', 'warning'], `Received Unknown Lva event telemetry: ${lvaEvent}`);
                break;
        }

        return;
    }

    protected abstract async onHandleDeviceProperties(desiredChangedSettings: any);

    protected async onHandleDevicePropertiesInternal(desiredChangedSettings: any) {
        try {
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

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
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
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

            this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `Device live properties updated: ${JSON.stringify(properties, null, 4)}`);
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `Error while updating client properties: ${ex.message}`);
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
                this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `sendEvent: ${JSON.stringify(data, null, 4)}`);
            }
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `sendMeasurement: ${ex.message}`);
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `inspect the error: ${JSON.stringify(ex, null, 4)}`);

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

    protected async startLvaProcessingInternal(autoStart: boolean): Promise<boolean> {
        await this.sendMeasurement({
            [LvaInterface.Event.StartLvaGraphCommandReceived]: autoStart ? 'AutoStart' : 'Command'
        });

        if (this.deviceSettings[IoTCameraDeviceSettings.DebugTelemetry] === true) {
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `Graph Instance Name: ${JSON.stringify(this.amsGraph.getInstanceName(), null, 4)}`);
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `Graph Instance: ${JSON.stringify(this.amsGraph.getInstance(), null, 4)}`);
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `Graph Topology Name: ${JSON.stringify(this.amsGraph.getInstanceName(), null, 4)}`);
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `Graph Topology: ${JSON.stringify(this.amsGraph.getTopology(), null, 4)}`);
        }

        const startLvaGraphResult = await this.amsGraph.startLvaGraph();
        if (startLvaGraphResult) {
            await this.sendMeasurement({
                [IoTCameraDeviceInterface.State.CameraState]: CameraState.Active
            });
        }

        return startLvaGraphResult;
    }

    private async connectDeviceClientInternal(
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
                result.clientConnectionMessage = `Failed to connect device client interface from connection string - device: ${this.cameraInfo.cameraId}`;
            }
            else {
                result.clientConnectionStatus = true;
                result.clientConnectionMessage = `Successfully connected to IoT Central - device: ${this.cameraInfo.cameraId}`;
            }
        }
        catch (ex) {
            result.clientConnectionStatus = false;
            result.clientConnectionMessage = `Failed to instantiate client interface from configuraiton: ${ex.message}`;

            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `${result.clientConnectionMessage}`);
        }

        if (result.clientConnectionStatus === false) {
            return result;
        }

        try {
            await this.deviceClient.open();

            this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `Device client is connected`);

            this.deviceTwin = await this.deviceClient.getTwin();
            this.deviceTwin.on('properties.desired', devicePropertiesHandler);

            this.deviceClient.on('error', this.onDeviceClientError);

            this.deviceClient.onDeviceMethod(LvaInterface.Command.StartLvaProcessing, this.startLvaProcessing);
            this.deviceClient.onDeviceMethod(LvaInterface.Command.StopLvaProcessing, this.stopLvaProcessing);

            const cameraProps = await this.getCameraProps();

            await this.updateDeviceProperties({
                [IoTCameraDeviceInterface.Property.CameraName]: this.cameraInfo.cameraName,
                [IoTCameraDeviceInterface.Property.RtspUrl]: this.cameraInfo.rtspUrl,
                [IoTCameraDeviceInterface.Property.RtspAuthUsername]: this.cameraInfo.rtspAuthUsername,
                [IoTCameraDeviceInterface.Property.RtspAuthPassword]: this.cameraInfo.rtspAuthPassword,
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

            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], result.clientConnectionMessage);
        }

        return result;
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
        this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `Device client connection error: ${error.message}`);
        this.healthState = HealthState.Critical;
    }

    @bind
    // @ts-ignore
    private async startLvaProcessing(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `${LvaInterface.Command.StartLvaProcessing} command received`);

        try {
            const startLvaGraphResult = await this.startLvaProcessingInternal(false);

            await commandResponse.send(202, {
                value: `LVA Edge start graph request: ${startLvaGraphResult ? 'succeeded' : 'failed'}`
            });
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `startLvaProcessing error: ${ex.message}`);
        }
    }

    @bind
    // @ts-ignore
    private async stopLvaProcessing(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.lvaGatewayModule.logger(['AmsCameraDevice', 'info'], `${LvaInterface.Command.StopLvaProcessing} command received`);

        try {
            await this.sendMeasurement({
                [LvaInterface.Event.StopLvaGraphCommandReceived]: this.cameraInfo.cameraId
            });

            const stopLvaGraphResult = await this.amsGraph.stopLvaGraph();
            if (stopLvaGraphResult) {
                await this.sendMeasurement({
                    [IoTCameraDeviceInterface.State.CameraState]: CameraState.Inactive
                });
            }

            await commandResponse.send(202, {
                value: `LVA Edge stop graph request: ${stopLvaGraphResult ? 'succeeded' : 'failed'}`
            });
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsCameraDevice', 'error'], `Stop LVA error ${ex.message}`);
        }
    }
}
