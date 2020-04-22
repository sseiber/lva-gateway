import { ModuleService, IAmsGraph } from './module';
import {
    IClientConnectResult,
    IoTCameraDeviceSettings,
    AmsCameraDevice
} from './device';
import { bind, emptyObj } from '../utils';

interface IMotionInference {
    type: string;
    motion: {
        box: {
            l: number,
            t: number,
            w: number,
            h: number
        }
    };
}

enum MotionDetectorSettings {
    Sensitivity = 'wpSensitivity'
}

interface IMotionDetectorSettings {
    [MotionDetectorSettings.Sensitivity]: string;
}

const MotionDetectorInterface = {
    Telemetry: {
        InferenceCount: 'tlInferenceCount',
        Inference: 'tlInference'
    },
    Setting: {
        Sensitivity: MotionDetectorSettings.Sensitivity
    }
};

export class AmsMotionDetectorDevice extends AmsCameraDevice {
    private motionDetectorSettings: IMotionDetectorSettings = {
        [MotionDetectorSettings.Sensitivity]: ''
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

            await this.deferredStart.promise;

            if (this.deviceSettings[IoTCameraDeviceSettings.AutoStart] === true) {
                try {
                    await this.startLvaProcessingInternal(true);
                }
                catch (ex) {
                    this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'error'], `Error while trying to auto-start Lva graph: ${ex.message}`);
                }
            }
        }
        catch (ex) {
            clientConnectionResult.clientConnectionStatus = false;
            clientConnectionResult.clientConnectionMessage = `An error occurred while accessing the device twin properties`;
        }

        return clientConnectionResult;
    }

    public async processLvaInferences(inferences: IMotionInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        try {
            let inferenceCount = 0;

            for (const inference of inferences) {
                ++inferenceCount;

                await this.sendMeasurement({
                    [MotionDetectorInterface.Telemetry.Inference]: inference
                });
            }

            if (inferenceCount > 0) {
                await this.sendMeasurement({
                    [MotionDetectorInterface.Telemetry.InferenceCount]: inferenceCount
                });
            }
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    public setGraphInstance(amsGraph: IAmsGraph): boolean {
        this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'info'], `Setting graph instance`);

        if (!amsGraph?.instance || !amsGraph?.topology) {
            this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'error'], `The amsGraph was undefined`);
            return false;
        }

        if (amsGraph?.initialized === true) {
            this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'warning'], `Graph instance already set for graph: ${amsGraph?.instance?.name || '(name not detected)'}`);
            return true;
        }

        amsGraph.instance.name = (amsGraph.instance?.name || '').replace('###RtspCameraId', this.cameraId);
        amsGraph.instance.properties.topologyName = (amsGraph.instance?.properties?.topologyName || '###RtspCameraId').replace('###RtspCameraId', this.cameraId);

        amsGraph.topology.name = (amsGraph.topology?.name || '').replace('###RtspCameraId', this.cameraId);
        amsGraph.topology.properties.sources[0].name = `RtspSource_${this.cameraId}`;
        amsGraph.topology.properties.sources[0].endpoint.url = this.deviceSettings[IoTCameraDeviceSettings.RtspUrl];
        amsGraph.topology.properties.sources[0].endpoint.credentials.username = this.deviceSettings[IoTCameraDeviceSettings.RtspAuthUsername];
        amsGraph.topology.properties.sources[0].endpoint.credentials.password = this.deviceSettings[IoTCameraDeviceSettings.RtspAuthPassword];
        amsGraph.topology.properties.processors[0].sensitivity = this.motionDetectorSettings[MotionDetectorSettings.Sensitivity];
        amsGraph.topology.properties.processors[0].inputs[0].moduleName = `RtspSource_${this.cameraId}`;

        return amsGraph.initialized = true;
    }

    @bind
    protected async onHandleDeviceProperties(desiredChangedSettings: any) {
        await super.onHandleDeviceProperties(desiredChangedSettings);

        try {
            this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

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
                    case MotionDetectorInterface.Setting.Sensitivity:
                        patchedProperties[setting] = this.motionDetectorSettings[setting] = value || '';
                        break;

                    default:
                        break;
                }
            }

            if (!emptyObj(patchedProperties)) {
                await this.updateDeviceProperties(patchedProperties);
            }
        }
        catch (ex) {
            this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }

        this.deferredStart.resolve();
    }
}
