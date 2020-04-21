import { ModuleService, IAmsGraph } from './module';
import {
    IClientConnectResult,
    IoTCameraDeviceSettings,
    AmsCameraDevice
} from './device';
import { bind, emptyObj } from '../utils';

interface IObjectInference {
    type: string;
    entity: {
        box: {
            l: number,
            t: number,
            w: number,
            h: number
        },
        tag: {
            confidence: number;
            value: string
        }
    };
}

enum ObjectDetectorSettings {
    DetectionClass = 'wpDetectionClass'
}

interface IObjectDetectorSettings {
    [ObjectDetectorSettings.DetectionClass]: string;
}

const ObjectDetectorInterface = {
    Telemetry: {
        InferenceCount: 'tlInferenceCount',
        Inference: 'tlInference'
    },
    Setting: {
        DetectionClass: ObjectDetectorSettings.DetectionClass
    }
};

export class AmsObjectDetectorDevice extends AmsCameraDevice {
    private objectDetectorSettings: IObjectDetectorSettings = {
        [ObjectDetectorSettings.DetectionClass]: ''
    };

    constructor(lvaGatewayModule: ModuleService, amsGraph: IAmsGraph, cameraId: string, cameraName: string) {
        super(lvaGatewayModule, amsGraph, cameraId, cameraName);
    }

    public async connectDeviceClient(dpsHubConnectionString: string): Promise<IClientConnectResult> {
        let clientConnectionResult: IClientConnectResult = {
            clientConnectionStatus: false,
            clientConnectionMessage: ''
        };

        try {
            clientConnectionResult = await this.connectDeviceClientInternal(dpsHubConnectionString, this.onHandleDeviceProperties);
        }
        catch (ex) {
            clientConnectionResult.clientConnectionStatus = false;
            clientConnectionResult.clientConnectionMessage = `An error occurred while accessing the device twin properties`;
        }

        return clientConnectionResult;
    }

    public async processLvaInferences(inferences: IObjectInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        if (process.env.DEBUG_DEVICE_TELEMETRY === this.cameraId) {
            this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'info'], `processLvaInferences: ${inferences}`);
        }

        try {
            let inferenceCount = 0;

            for (const inference of inferences) {
                if ((inference.entity?.tag?.value || '').toUpperCase() === this.objectDetectorSettings[ObjectDetectorSettings.DetectionClass]) {
                    ++inferenceCount;
                }

                await this.sendMeasurement({
                    [ObjectDetectorInterface.Telemetry.Inference]: inference
                });
            }

            if (inferenceCount > 0) {
                await this.sendMeasurement({
                    [ObjectDetectorInterface.Telemetry.InferenceCount]: inferenceCount
                });
            }
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    public setGraphInstance(amsGraph: IAmsGraph): boolean {
        this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'info'], `Setting graph instance`);

        if (!amsGraph?.instance || !amsGraph?.topology) {
            this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'error'], `The amsGraph was undefined`);
            return false;
        }

        if (amsGraph?.initialized === true) {
            this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'warning'], `Graph instance already set for graph: ${amsGraph?.instance?.name || '(name not detected)'}`);
            return true;
        }

        amsGraph.instance.name = (amsGraph.instance?.name || '').replace('###RtspCameraId', this.cameraId);
        amsGraph.instance.properties.topologyName = (amsGraph.instance?.properties?.topologyName || '###RtspCameraId').replace('###RtspCameraId', this.cameraId);

        this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'info'], `### amsGraph.instance: ${JSON.stringify(amsGraph.instance, null, 4)}`);

        amsGraph.topology.name = (amsGraph.topology?.name || '').replace('###RtspCameraId', this.cameraId);
        amsGraph.topology.properties.sources[0].name = `RtspSource_${this.cameraId}`;
        amsGraph.topology.properties.sources[0].endpoint.url = this.deviceSettings[IoTCameraDeviceSettings.RtspUrl];
        amsGraph.topology.properties.sources[0].endpoint.credentials.username = this.deviceSettings[IoTCameraDeviceSettings.RtspAuthUsername];
        amsGraph.topology.properties.sources[0].endpoint.credentials.password = this.deviceSettings[IoTCameraDeviceSettings.RtspAuthPassword];
        amsGraph.topology.properties.processors[0].inputs[0].moduleName = `RtspSource_${this.cameraId}`;

        this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'info'], `### amsGraph.topology: ${JSON.stringify(amsGraph.topology, null, 4)}`);

        return amsGraph.initialized = true;
    }

    @bind
    protected async onHandleDeviceProperties(desiredChangedSettings: any) {
        await super.onHandleDeviceProperties(desiredChangedSettings);

        try {
            this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

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
                    this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'error'], `No value field found for desired property '${setting}'`);
                    continue;
                }

                switch (setting) {
                    case ObjectDetectorInterface.Setting.DetectionClass:
                        patchedProperties[setting] = this.objectDetectorSettings[setting] = (value || '').toUpperCase();
                        break;

                    default:
                        this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'warning'], `Received desired property change for unknown setting '${setting}'`);
                        break;
                }
            }

            if (!emptyObj(patchedProperties)) {
                await this.updateDeviceProperties(patchedProperties);
            }

            if (this.deviceSettings[IoTCameraDeviceSettings.AutoStart] === true) {
                try {
                    await this.startLvaProcessingInternal();
                }
                catch (ex) {
                    this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'error'], `Error while trying to auto-start Lva graph: ${ex.message}`);
                }
            }
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsObjectDetectorDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }
    }
}
