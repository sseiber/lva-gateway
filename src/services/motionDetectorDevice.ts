import {
    ICameraDeviceProvisionInfo,
    ModuleService
} from './module';
import { AmsGraph } from './amsGraph';
import { AmsCameraDevice } from './device';
import * as moment from 'moment';
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

    public setGraphParameters(): any {
        this.amsAssetName = `Motion-${moment().utc().format('YYYYMMDD-HHmmss')}`;
        this.amsAssetCreationTime = moment().utc();

        return {
            rtspUrl: this.cameraInfo.rtspUrl,
            rtspAuthUsername: this.cameraInfo.rtspAuthUsername || 'username',
            rtspAuthPassword: this.cameraInfo.rtspAuthPassword || 'password',
            sensitivity: this.motionDetectorSettings[MotionDetectorSettings.Sensitivity],
            assetName: this.amsAssetName
        };
    }

    public async deviceReady(): Promise<void> {
        await this.sendMeasurement({
            [MotionDetectorInterface.Event.InferenceEventVideoUrl]: 'https://portal.loopbox-nl.com/'
        });

        await this.updateDeviceProperties({
            [MotionDetectorSettings.Sensitivity]: this.motionDetectorSettings[MotionDetectorSettings.Sensitivity],
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
                    [MotionDetectorInterface.Telemetry.Inference]: inference
                });

                this.lastInferenceTime = Date.now();
            }

            if (inferenceCount > 0) {
                const inferenceTelemetry: any = {
                    [MotionDetectorInterface.Telemetry.InferenceCount]: inferenceCount
                };

                if (this.activeVideoInference === false) {
                    this.activeVideoInference = true;

                    const startTime = moment().utc().subtract(5, 'seconds').toISOString();
                    inferenceTelemetry[MotionDetectorInterface.Event.InferenceEventVideoUrl] = `https://portal.loopbox-nl.com/ampplayer?an=${this.amsAssetName}&st=${startTime}`;
                }

                await this.sendMeasurement(inferenceTelemetry);
            }
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsMotionDetectorDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    @bind
    public async inferenceTimer(): Promise<void> {
        if (Date.now() - this.lastInferenceTime > 2500) {
            this.activeVideoInference = false;
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
