import { HealthState } from './health';
import { Mqtt as IoTHubTransport } from 'azure-iot-device-mqtt';
import {
    DeviceMethodRequest,
    DeviceMethodResponse,
    Client as IoTDeviceClient,
    Twin,
    Message as IoTMessage
} from 'azure-iot-device';
import * as _get from 'lodash.get';
import { bind, emptyObj } from '../utils';

interface ICameraProps {
    rpManufacturer: string;
    rpModel: string;
}

interface ICameraSettings {
    wpRtspUrl: string;
    wpRtspAuthUsername: string;
    wpRtspAuthPassword: string;
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

const AmsCameraDeviceInterface = {
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
        RtspUrl: 'wpRtspUrl',
        RtspAuthUsername: 'wpRtspAuthUsername',
        RtspAuthPassword: 'wpRtspAuthPassword'
    }
};

export class AmsCameraDevice {
    private logger: (tags: any, message: any) => void;
    private invokeMethod: (methodParams: any) => Promise<void>;
    private graphInstance: null;
    private graphTopology: null;
    private cameraId: string = '';
    private cameraName: string = '';
    private deviceClient: IoTDeviceClient = null;
    private deviceTwin: Twin = null;

    private healthState = HealthState.Good;
    private deviceSettings: ICameraSettings = {
        wpRtspUrl: '',
        wpRtspAuthUsername: '',
        wpRtspAuthPassword: ''
    };

    constructor(logger: LoggingService, invokeMethod: (methodParams: any) => Promise<void>, graphInstance: any, graphTopology: any, cameraId: string, cameraName: string) {
        this.logger = logger;
        this.invokeMethod = invokeMethod;
        this.graphInstance = graphInstance;
        this.graphTopology = graphTopology;
        this.cameraId = cameraId;
        this.cameraName = cameraName;
    }

    @bind
    public async getHealth(): Promise<number> {
        await this.sendMeasurement({
            [AmsCameraDeviceInterface.Telemetry.SystemHeartbeat]: this.healthState
        });

        return this.healthState;
    }

    public async deleteCamera(): Promise<void> {
        this.logger.log(['AmsCameraDevice', 'info'], `Deleting camera camera device instance for cameraId: ${this.cameraId}`);

        await this.sendMeasurement({
            [AmsCameraDeviceInterface.State.CameraState]: CameraState.Inactive
        });
    }

    public async sendTelemetry(telemetryData: any): Promise<void> {
        return this.sendMeasurement(telemetryData);
    }

    public async processAxisInferences(inferences: IInference[]): Promise<void> {
        if (!inferences || !Array.isArray(inferences) || !this.deviceClient) {
            this.logger.log(['AmsCameraDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        if (_get(process.env, 'DEBUG_DEVICE_TELEMETRY') === this.cameraId) {
            this.logger.log(['AmsCameraDevice', 'info'], `processAxisInferences: ${inferences}`);
        }

        try {
            let inferenceCount = 0;

            for (const inference of inferences) {
                ++inferenceCount;

                await this.sendMeasurement({
                    [AmsCameraDeviceInterface.Telemetry.Inference]: inference
                });
            }

            if (inferenceCount > 0) {
                await this.sendMeasurement({
                    [AmsCameraDeviceInterface.Telemetry.InferenceCount]: inferenceCount
                });
            }
        }
        catch (ex) {
            this.logger.log(['AmsCameraDevice', 'error'], `Error processing downstream message: ${ex.message}`);
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

            this.logger.log(['AmsCameraDevice', 'error'], `${result.clientConnectionMessage}`);
        }

        if (result.clientConnectionStatus === false) {
            return result;
        }

        try {
            await this.deviceClient.open();

            this.logger.log(['AmsCameraDevice', 'info'], `Device client is connected`);

            this.deviceTwin = await this.deviceClient.getTwin();
            this.deviceTwin.on('properties.desired', this.onHandleDeviceProperties);

            this.deviceClient.on('error', this.onDeviceClientError);

            this.deviceClient.onDeviceMethod(LvaInterface.Command.StartLvaProcessing, this.startLvaProcessing);
            this.deviceClient.onDeviceMethod(LvaInterface.Command.StopLvaProcessing, this.stopLvaProcessing);
            this.deviceClient.on('inputMessage', this.onHandleDownstreamMessages);

            const cameraProps = await this.getCameraProps();

            await this.updateDeviceProperties({
                [AmsCameraDeviceInterface.Property.CameraName]: this.cameraName,
                [AmsCameraDeviceInterface.Property.Manufacturer]: cameraProps.rpManufacturer,
                [AmsCameraDeviceInterface.Property.Model]: cameraProps.rpModel
            });

            await this.sendMeasurement({
                [AmsCameraDeviceInterface.State.IoTCentralClientState]: IoTCentralClientState.Connected,
                [AmsCameraDeviceInterface.State.CameraState]: CameraState.Inactive
            });

            result.clientConnectionStatus = true;
        }
        catch (ex) {
            result.clientConnectionStatus = false;
            result.clientConnectionMessage = `IoT Central connection error: ${ex.message}`;

            this.logger.log(['AmsCameraDevice', 'error'], result.clientConnectionMessage);
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

            if (_get(process.env, 'DEBUG_DEVICE_TELEMETRY') === this.cameraId) {
                this.logger.log(['AmsCameraDevice', 'info'], `sendEvent: ${JSON.stringify(data, null, 4)}`);
            }
        }
        catch (ex) {
            this.logger.log(['AmsCameraDevice', 'error'], `sendMeasurement: ${ex.message}`);
            this.logger.log(['AmsCameraDevice', 'error'], `inspect the error: ${JSON.stringify(ex, null, 4)}`);

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

            this.logger.log(['AmsCameraDevice', 'info'], `Device live properties updated: ${JSON.stringify(properties, null, 4)}`);
        }
        catch (ex) {
            this.logger.log(['AmsCameraDevice', 'error'], `Error while updating client properties: ${ex.message}`);
        }
    }

    @bind
    private async onHandleDeviceProperties(desiredChangedSettings: any) {
        try {
            this.logger.log(['AmsCameraDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

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
                    this.logger.log(['AmsCameraDevice', 'error'], `No value field found for desired property '${setting}'`);
                    continue;
                }

                let changedSettingResult;

                switch (setting) {
                    case AmsCameraDeviceInterface.Setting.RtspUrl:
                    case AmsCameraDeviceInterface.Setting.RtspAuthUsername:
                    case AmsCameraDeviceInterface.Setting.RtspAuthPassword:
                        changedSettingResult = await this.deviceSettingChange(setting, value);
                        break;

                    default:
                        this.logger.log(['AmsCameraDevice', 'warning'], `Received desired property change for unknown setting '${setting}'`);
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
            this.logger.log(['AmsCameraDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }
    }

    private async deviceSettingChange(setting: string, value: any): Promise<any> {
        this.logger.log(['AmsCameraDevice', 'info'], `Handle device setting change for '${setting}': ${typeof value === 'object' && value !== null ? JSON.stringify(value, null, 4) : value}`);

        const result = {
            value: undefined,
            status: true
        };

        switch (setting) {
            case AmsCameraDeviceInterface.Setting.RtspUrl:
            case AmsCameraDeviceInterface.Setting.RtspAuthUsername:
            case AmsCameraDeviceInterface.Setting.RtspAuthPassword:
                result.value = this.deviceSettings[setting] = value || '';
                break;

            default:
                this.logger.log(['AmsCameraDevice', 'info'], `Unknown device setting change request '${setting}'`);
                result.status = false;
        }

        return result;
    }

    @bind
    private async onHandleDownstreamMessages(inputName: string, message: any) {
        // this.logger.log(['AmsCameraDevice', 'info'], `Received downstream message: ${JSON.stringify(message, null, 4)}`);

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
                    this.logger.log(['AmsCameraDevice', 'info'], `Received routed message - inputName: ${inputName}, message: ${JSON.stringify(messageJson, null, 4)}`);
                    break;

                default:
                    this.logger.log(['AmsCameraDevice', 'warning'], `Warning: received routed message for unknown input: ${inputName}`);
                    break;
            }
        }
        catch (ex) {
            this.logger.log(['AmsCameraDevice', 'error'], `Error while handling downstream message: ${ex.message}`);
        }
    }

    @bind
    private onDeviceClientError(error: Error) {
        this.logger.log(['AmsCameraDevice', 'error'], `Device client connection error: ${error.message}`);
        this.healthState = HealthState.Critical;
    }

    @bind
    private async startLvaProcessing(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.logger.log(['AmsCameraDevice', 'info'], `${LvaInterface.Command.StartLvaProcessing} command received`);

        try {
            await this.sendMeasurement({
                [LvaInterface.Event.StartLvaGraphCommandReceived]: this.cameraId
            });

            const stopLvaGraphResponse = await this.stopLvaGraph(this.graphInstance, this.graphTopology);
            if (stopLvaGraphResponse.statusCode !== 201) {
                return commandResponse.send(stopLvaGraphResponse.statusCode, stopLvaGraphResponse);
            }

            const startLvaGraphResponse = await this.startLvaGraph();
            this.logger.log(['AmsCameraDevice', 'info'], `Axis camera mangement gateway returned with status: ${startLvaGraphResponse.statusCode}`);

            if (_get(startLvaGraphResponse, 'statusCode') === 201) {
                await this.sendMeasurement({
                    [AmsCameraDeviceInterface.State.CameraState]: CameraState.Active
                });
            }

            await commandResponse.send(startLvaGraphResponse.statusCode, startLvaGraphResponse);
        }
        catch (ex) {
            this.logger.log(['AmsCameraDevice', 'error'], `startLvaProcessing error: ${ex.message}`);

            await commandResponse.send(400, {
                statusCode: 400,
                message: ex.message
            });
        }
    }

    @bind
    // @ts-ignore
    private async stopLvaProcessing(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.logger.log(['AmsCameraDevice', 'info'], `${LvaInterface.Command.StopLvaProcessing} command received`);

        try {
            await this.sendMeasurement({
                [LvaInterface.Event.StopLvaGraphCommandReceived]: this.cameraId
            });

            const stopLvaGraphResponse = await this.stopLvaGraph(this.graphInstance, this.graphTopology);
            this.logger.log(['AmsCameraDevice', 'info'], `Axis camera mangement gateway returned with status: ${stopLvaGraphResponse.statusCode}`);

            if (_get(stopLvaGraphResponse, 'statusCode') === 201) {
                await this.sendMeasurement({
                    [AmsCameraDeviceInterface.State.CameraState]: CameraState.Inactive
                });
            }

            await commandResponse.send(stopLvaGraphResponse.statusCode, stopLvaGraphResponse);
        }
        catch (ex) {
            this.logger.log(['AmsCameraDevice', 'error'], `Stop LVA error ${ex.message}`);

            await commandResponse.send(400, {
                statusCode: 400,
                message: ex.message
            });
        }
    }

    private async startLvaGraph(): Promise<ICommandResponse> {
        this.logger.log(['ModuleService', 'info'], `startLvaGraph with graphType`);

        try {
            const methodParams = {
                methodName: ``,
                payload: null,
                connectTimeoutInSeconds: 30,
                responseTimeoutInSeconds: 30
            };

            this.logger.log(['ModuleService', 'info'], `### GraphTopologySet`);
            methodParams.methodName = `GraphTopologySet`;
            methodParams.payload = this.graphTopology;
            await this.invokeMethod(methodParams);

            this.logger.log(['ModuleService', 'info'], `### GraphInstanceSet`);
            methodParams.methodName = `GraphInstanceSet`;
            methodParams.payload = this.graphInstance;
            await this.invokeMethod(methodParams);

            this.logger.log(['ModuleService', 'info'], `### GraphInstanceStart`);
            methodParams.methodName = `GraphInstanceStart`;
            methodParams.payload = this.graphInstance;
            await this.invokeMethod(methodParams);

            return {
                statusCode: 201,
                message: 'Start LVA Graph done'
            };
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `startLvaGraph error: ${ex.message}`);

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
                this.logger.log(['ModuleService', 'info'], `### GraphInstanceStop`);
                methodParams.methodName = `GraphInstanceStop`;
                methodParams.payload = graphInstance;
                await this.invokeMethod(methodParams);

                this.logger.log(['ModuleService', 'info'], `### GraphInstanceDelete`);
                methodParams.methodName = `GraphInstanceDelete`;
                methodParams.payload = graphInstance;
                await this.invokeMethod(methodParams);

                this.logger.log(['ModuleService', 'info'], `### GraphTopologyDelete`);
                methodParams.methodName = `GraphTopologyDelete`;
                methodParams.payload = graphTopology;
                await this.invokeMethod(methodParams);
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
}
