import {
    ICameraDeviceProvisionInfo,
    ModuleService,
    AmsGraph
} from './module';
import { AmsCameraDevice } from './device';
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
    Event: {
        InferenceEventVideoUrl: 'evInferenceEventVideoUrl'
    },
    Property: {
        InferenceVideoUrl: 'rpInferenceVideoUrl',
        InferenceImageUrl: 'rpInferenceImageUrl'
    },
    Setting: {
        Sensitivity: MotionDetectorSettings.Sensitivity
    }
};

export class AmsMotionDetectorDevice extends AmsCameraDevice {
    private motionDetectorSettings: IMotionDetectorSettings = {
        [MotionDetectorSettings.Sensitivity]: ''
    };

    constructor(lvaGatewayModule: ModuleService, amsGraph: AmsGraph, cameraInfo: ICameraDeviceProvisionInfo) {
        super(lvaGatewayModule, amsGraph, cameraInfo);
    }

    public async initDevice(): Promise<void> {
        await this.sendMeasurement({
            [MotionDetectorInterface.Event.InferenceEventVideoUrl]: 'https://portal.loopbox-nl.com/'
        });

        await this.updateDeviceProperties({
            [MotionDetectorInterface.Property.InferenceImageUrl]: 'https://iotcsavisionai.blob.core.windows.net/image-link-test/seattlesbest-1_199_.jpg',
            [MotionDetectorInterface.Property.InferenceVideoUrl]: 'https://portal.loopbox-nl.com/'
        });
    }

    public async processLvaInferences(inferences: IMotionInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.lvaGatewayModule.logger(['AmsMotionDetectorDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        try {
            let inferenceCount = 0;

            for (const inference of inferences) {
                ++inferenceCount;

                await this.sendMeasurement({
                    [MotionDetectorInterface.Telemetry.Inference]: inference,
                    [MotionDetectorInterface.Event.InferenceEventVideoUrl]: '',
                    [MotionDetectorInterface.Property.InferenceImageUrl]: '',
                    [MotionDetectorInterface.Property.InferenceVideoUrl]: ''
                });
            }

            if (inferenceCount > 0) {
                await this.sendMeasurement({
                    [MotionDetectorInterface.Telemetry.InferenceCount]: inferenceCount
                });
            }
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsMotionDetectorDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    @bind
    protected async onHandleDeviceProperties(desiredChangedSettings: any) {
        await super.onHandleDevicePropertiesInternal(desiredChangedSettings);

        try {
            this.lvaGatewayModule.logger(['AmsMotionDetectorDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

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

                        this.amsGraph.setParam(setting, value);
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
            this.lvaGatewayModule.logger(['AmsMotionDetectorDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }

        this.deferredStart.resolve();
    }
}
