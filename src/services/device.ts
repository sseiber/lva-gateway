import { HealthState } from './health';
import { Mqtt as IoTHubTransport } from 'azure-iot-device-mqtt';
import {
    DeviceMethodRequest,
    DeviceMethodResponse,
    Client as IoTDeviceClient,
    Twin,
    Message as IoTMessage
} from 'azure-iot-device';
import { bind, emptyObj } from '../utils';

interface ICameraProps {
    rpManufacturer: string;
    rpModel: string;
}

interface IInference {
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

interface ICommandResponse {
    statusCode: number;
    message: string;
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

enum IoTCameraDeviceSettings {
    RtspUrl = 'wpRtspUrl',
    RtspAuthUsername = 'wpRtspAuthUsername',
    RtspAuthPassword = 'wpRtspAuthPassword'
}

interface IIoTCameraDeviceSettings {
    [IoTCameraDeviceSettings.RtspUrl]: string;
    [IoTCameraDeviceSettings.RtspAuthUsername]: string;
    [IoTCameraDeviceSettings.RtspAuthPassword]: string;
}

const IoTCameraDeviceInterface = {
    Telemetry: {
        SystemHeartbeat: 'tlSystemHeartbeat',
        InferenceCount: 'tlInferenceCount',
        Inference: 'tlInference'
    },
    State: {
        IoTCentralClientState: 'stIoTCentralClientState',
        CameraState: 'stCameraState'
    },
    Property: {
        CameraName: 'rpCameraName',
        Manufacturer: 'rpManufacturer',
        Model: 'rpModel'
    },
    Setting: {
        RtspUrl: IoTCameraDeviceSettings.RtspUrl,
        RtspAuthUsername: IoTCameraDeviceSettings.RtspAuthUsername,
        RtspAuthPassword: IoTCameraDeviceSettings.RtspAuthUsername
    }
};

export class AmsCameraDevice {
    private log: (tags: any, message: any) => void;
    private invokeMethod: (methodParams: any) => Promise<void>;
    private graphInstance: any;
    private graphTopology: any;
    private cameraId: string = '';
    private cameraName: string = '';
    private deviceClient: IoTDeviceClient;
    private deviceTwin: Twin;

    private healthState = HealthState.Good;
    private deviceSettings: IIoTCameraDeviceSettings = {
        [IoTCameraDeviceSettings.RtspUrl]: '',
        [IoTCameraDeviceSettings.RtspAuthUsername]: '',
        [IoTCameraDeviceSettings.RtspAuthPassword]: ''
    };

    constructor(log: (tags: any, message: any) => void, invokeMethod: (methodParams: any) => Promise<void>, graphInstance: any, graphTopology: any, cameraId: string, cameraName: string) {
        this.log = log;
        this.invokeMethod = invokeMethod;
        this.graphInstance = graphInstance;
        this.graphTopology = graphTopology;
        this.cameraId = cameraId;
        this.cameraName = cameraName;
    }

    @bind
    public async getHealth(): Promise<number> {
        await this.sendMeasurement({
            [IoTCameraDeviceInterface.Telemetry.SystemHeartbeat]: this.healthState
        });

        return this.healthState;
    }

    public async deleteCamera(): Promise<void> {
        this.log(['AmsCameraDevice', 'info'], `Deleting camera camera device instance for cameraId: ${this.cameraId}`);

        await this.sendMeasurement({
            [IoTCameraDeviceInterface.State.CameraState]: CameraState.Inactive
        });
    }

    public async sendTelemetry(telemetryData: any): Promise<void> {
        return this.sendMeasurement(telemetryData);
    }

    public async processLvaInferences(inferences: IInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.log(['AmsCameraDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        if (process.env.DEBUG_DEVICE_TELEMETRY === this.cameraId) {
            this.log(['AmsCameraDevice', 'info'], `processLvaInferences: ${inferences}`);
        }

        try {
            let inferenceCount = 0;

            for (const inference of inferences) {
                ++inferenceCount;

                await this.sendMeasurement({
                    [IoTCameraDeviceInterface.Telemetry.Inference]: inference
                });
            }

            if (inferenceCount > 0) {
                await this.sendMeasurement({
                    [IoTCameraDeviceInterface.Telemetry.InferenceCount]: inferenceCount
                });
            }
        }
        catch (ex) {
            this.log(['AmsCameraDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    public async connectDeviceClient(dpsHubConnectionString: string): Promise<any> {
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

            this.log(['AmsCameraDevice', 'error'], `${result.clientConnectionMessage}`);
        }

        if (result.clientConnectionStatus === false) {
            return result;
        }

        try {
            await this.deviceClient.open();

            this.log(['AmsCameraDevice', 'info'], `Device client is connected`);

            this.deviceTwin = await this.deviceClient.getTwin();
            this.deviceTwin.on('properties.desired', this.onHandleDeviceProperties);

            this.deviceClient.on('error', this.onDeviceClientError);

            this.deviceClient.onDeviceMethod(LvaInterface.Command.StartLvaProcessing, this.startLvaProcessing);
            this.deviceClient.onDeviceMethod(LvaInterface.Command.StopLvaProcessing, this.stopLvaProcessing);
            this.deviceClient.on('inputMessage', this.onHandleDownstreamMessages);

            const cameraProps = await this.getCameraProps();

            await this.updateDeviceProperties({
                [IoTCameraDeviceInterface.Property.CameraName]: this.cameraName,
                [IoTCameraDeviceInterface.Property.Manufacturer]: cameraProps.rpManufacturer,
                [IoTCameraDeviceInterface.Property.Model]: cameraProps.rpModel
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

            this.log(['AmsCameraDevice', 'error'], result.clientConnectionMessage);
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
    private async sendMeasurement(data: any): Promise<void> {
        if (!data || !this.deviceClient) {
            return;
        }

        try {
            const iotcMessage = new IoTMessage(JSON.stringify(data));

            await this.deviceClient.sendEvent(iotcMessage);

            if (process.env.DEBUG_DEVICE_TELEMETRY === this.cameraId) {
                this.log(['AmsCameraDevice', 'info'], `sendEvent: ${JSON.stringify(data, null, 4)}`);
            }
        }
        catch (ex) {
            this.log(['AmsCameraDevice', 'error'], `sendMeasurement: ${ex.message}`);
            this.log(['AmsCameraDevice', 'error'], `inspect the error: ${JSON.stringify(ex, null, 4)}`);

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

            this.log(['AmsCameraDevice', 'info'], `Device live properties updated: ${JSON.stringify(properties, null, 4)}`);
        }
        catch (ex) {
            this.log(['AmsCameraDevice', 'error'], `Error while updating client properties: ${ex.message}`);
        }
    }

    @bind
    private async onHandleDeviceProperties(desiredChangedSettings: any) {
        try {
            this.log(['AmsCameraDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

            const patchedProperties = {};

            for (const setting in desiredChangedSettings) {
                if (!desiredChangedSettings.hasOwnProperty(setting)) {
                    continue;
                }

                if (setting === '$version') {
                    continue;
                }

                const value = desiredChangedSettings[`${setting}`]?.value;
                if (!value) {
                    this.log(['AmsCameraDevice', 'error'], `No value field found for desired property '${setting}'`);
                    continue;
                }

                let changedSettingResult;

                switch (setting) {
                    case IoTCameraDeviceInterface.Setting.RtspUrl:
                    case IoTCameraDeviceInterface.Setting.RtspAuthUsername:
                    case IoTCameraDeviceInterface.Setting.RtspAuthPassword:
                        changedSettingResult = await this.deviceSettingChange(setting, value);
                        break;

                    default:
                        this.log(['AmsCameraDevice', 'warning'], `Received desired property change for unknown setting '${setting}'`);
                        break;
                }

                if (changedSettingResult?.status === true) {
                    patchedProperties[setting] = changedSettingResult.value;
                }
            }

            if (!emptyObj(patchedProperties)) {
                await this.updateDeviceProperties(patchedProperties);
            }
        }
        catch (ex) {
            this.log(['AmsCameraDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }
    }

    private async deviceSettingChange(setting: string, value: any): Promise<any> {
        this.log(['AmsCameraDevice', 'info'], `Handle device setting change for '${setting}': ${typeof value === 'object' && value !== null ? JSON.stringify(value, null, 4) : value}`);

        const result = {
            value: undefined,
            status: true
        };

        switch (setting) {
            case IoTCameraDeviceInterface.Setting.RtspUrl:
            case IoTCameraDeviceInterface.Setting.RtspAuthUsername:
            case IoTCameraDeviceInterface.Setting.RtspAuthPassword:
                result.value = this.deviceSettings[setting] = value || '';
                break;

            default:
                this.log(['AmsCameraDevice', 'info'], `Unknown device setting change request '${setting}'`);
                result.status = false;
        }

        return result;
    }

    @bind
    private async onHandleDownstreamMessages(inputName: string, message: any) {
        // this.log(['AmsCameraDevice', 'info'], `Received downstream message: ${JSON.stringify(message, null, 4)}`);

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
                case 'lvadevicetelemetry':
                    this.log(['AmsCameraDevice', 'info'], `Received routed message - inputName: ${inputName}, message: ${JSON.stringify(messageJson, null, 4)}`);
                    break;

                default:
                    this.log(['AmsCameraDevice', 'warning'], `Warning: received routed message for unknown input: ${inputName}`);
                    break;
            }
        }
        catch (ex) {
            this.log(['AmsCameraDevice', 'error'], `Error while handling downstream message: ${ex.message}`);
        }
    }

    @bind
    private onDeviceClientError(error: Error) {
        this.log(['AmsCameraDevice', 'error'], `Device client connection error: ${error.message}`);
        this.healthState = HealthState.Critical;
    }

    @bind
    // @ts-ignore
    private async startLvaProcessing(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.log(['AmsCameraDevice', 'info'], `${LvaInterface.Command.StartLvaProcessing} command received`);

        try {
            await this.sendMeasurement({
                [LvaInterface.Event.StartLvaGraphCommandReceived]: this.cameraId
            });

            await this.stopLvaGraph(this.graphInstance, this.graphTopology);

            const startLvaGraphResponse = await this.startLvaGraph();
            this.log(['AmsCameraDevice', 'info'], `LVA Edge gateway returned with status: ${startLvaGraphResponse.statusCode}`);

            if (startLvaGraphResponse?.statusCode === 201) {
                await this.sendMeasurement({
                    [IoTCameraDeviceInterface.State.CameraState]: CameraState.Active
                });
            }

            await commandResponse.send(startLvaGraphResponse.statusCode, startLvaGraphResponse);
        }
        catch (ex) {
            this.log(['AmsCameraDevice', 'error'], `startLvaProcessing error: ${ex.message}`);

            await commandResponse.send(400, {
                statusCode: 400,
                message: ex.message
            });
        }
    }

    @bind
    // @ts-ignore
    private async stopLvaProcessing(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.log(['AmsCameraDevice', 'info'], `${LvaInterface.Command.StopLvaProcessing} command received`);

        try {
            await this.sendMeasurement({
                [LvaInterface.Event.StopLvaGraphCommandReceived]: this.cameraId
            });

            const stopLvaGraphResponse = await this.stopLvaGraph(this.graphInstance, this.graphTopology);
            this.log(['AmsCameraDevice', 'info'], `LVA edge gateway returned with status: ${stopLvaGraphResponse.statusCode}`);

            if (stopLvaGraphResponse?.statusCode === 201) {
                await this.sendMeasurement({
                    [IoTCameraDeviceInterface.State.CameraState]: CameraState.Inactive
                });
            }

            await commandResponse.send(stopLvaGraphResponse.statusCode, stopLvaGraphResponse);
        }
        catch (ex) {
            this.log(['AmsCameraDevice', 'error'], `Stop LVA error ${ex.message}`);

            await commandResponse.send(400, {
                statusCode: 400,
                message: ex.message
            });
        }
    }

    private async startLvaGraph(): Promise<ICommandResponse> {
        this.log(['ModuleService', 'info'], `startLvaGraph`);

        try {
            const methodParams = {
                methodName: ``,
                payload: null,
                connectTimeoutInSeconds: 30,
                responseTimeoutInSeconds: 30
            };

            this.log(['ModuleService', 'info'], `### GraphTopologySet`);
            methodParams.methodName = `GraphTopologySet`;
            methodParams.payload = this.graphTopology;
            await this.invokeMethod(methodParams);

            this.log(['ModuleService', 'info'], `### GraphInstanceSet`);
            methodParams.methodName = `GraphInstanceSet`;
            methodParams.payload = this.graphInstance;
            await this.invokeMethod(methodParams);

            this.log(['ModuleService', 'info'], `### GraphInstanceStart`);
            methodParams.methodName = `GraphInstanceStart`;
            methodParams.payload = this.graphInstance;
            await this.invokeMethod(methodParams);

            const message = `Sent request to LVA Edge to start graph: ${this.graphInstance?.name || ''}`; // xxx
            return {
                statusCode: 201,
                message: 'Start LVA Graph done'
            };
        }
        catch (ex) {
            this.log(['ModuleService', 'error'], `startLvaGraph error: ${ex.message}`);

            return {
                statusCode: 400,
                message: ex.mesage
            };
        }
    }

    private async stopLvaGraph(graphInstance: any, graphTopology: any): Promise<ICommandResponse> {
        try {
            const methodParams = {
                methodName: ``,
                payload: null,
                connectTimeoutInSeconds: 30,
                responseTimeoutInSeconds: 30
            };

            if (graphInstance && graphTopology) {
                this.log(['ModuleService', 'info'], `### GraphInstanceStop`);
                methodParams.methodName = `GraphInstanceStop`;
                methodParams.payload = graphInstance;
                await this.invokeMethod(methodParams);

                this.log(['ModuleService', 'info'], `### GraphInstanceDelete`);
                methodParams.methodName = `GraphInstanceDelete`;
                methodParams.payload = graphInstance;
                await this.invokeMethod(methodParams);

                this.log(['ModuleService', 'info'], `### GraphTopologyDelete`);
                methodParams.methodName = `GraphTopologyDelete`;
                methodParams.payload = graphTopology;
                await this.invokeMethod(methodParams);
            }

            return {
                statusCode: 201,
                message: `Successfully stopped LVA graph: ${graphInstance?.name || '(no graph was running)'}`
            };
        }
        catch (ex) {
            this.log(['ModuleService', 'error'], `stopLvaGraph error: ${ex.message}`);

            return {
                statusCode: 400,
                message: ex.message
            };
        }
    }
}
