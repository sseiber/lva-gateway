import {
    ICameraDeviceProvisionInfo,
    ModuleService
} from './module';
import { AmsGraph } from './amsGraph';
import { AmsCameraDevice } from './device';
import * as moment from 'moment';
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
    PrimaryDetectionClass = 'wpPrimaryDetectionClass',
    PrimaryConfidenceThreshold = 'wpPrimaryConfidenceThreshold'
}

interface IObjectDetectorSettings {
    [ObjectDetectorSettings.PrimaryDetectionClass]: string;
    [ObjectDetectorSettings.PrimaryConfidenceThreshold]: number;
}

const ObjectDetectorInterface = {
    Telemetry: {
        PrimaryDetectionCount: 'tlPrimaryDetectionCount',
        PrimaryConfidence: 'tlPrimaryConfidence',
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
        PrimaryDetectionClass: ObjectDetectorSettings.PrimaryDetectionClass,
        PrimaryConfidenceThreshold: ObjectDetectorSettings.PrimaryConfidenceThreshold
    }
};

export class AmsObjectDetectorDevice extends AmsCameraDevice {
    private objectDetectorSettings: IObjectDetectorSettings = {
        [ObjectDetectorSettings.PrimaryDetectionClass]: 'person',
        [ObjectDetectorSettings.PrimaryConfidenceThreshold]: 70.0
    };

    constructor(lvaGatewayModule: ModuleService, amsGraph: AmsGraph, cameraInfo: ICameraDeviceProvisionInfo) {
        super(lvaGatewayModule, amsGraph, cameraInfo);
    }

    public setGraphParameters(): any {
        this.amsAssetName = `${this.objectDetectorSettings[ObjectDetectorSettings.PrimaryDetectionClass]}-${moment().utc().format('YYYYMMDD-HHmmss')}`;
        this.amsAssetCreationTime = moment().utc();

        return {
            rtspUrl: this.cameraInfo.rtspUrl,
            rtspAuthUsername: this.cameraInfo.rtspAuthUsername || 'username',
            rtspAuthPassword: this.cameraInfo.rtspAuthPassword || 'password',
            assetName: this.amsAssetName
        };
    }

    public async deviceReady(): Promise<void> {
        await this.updateDeviceProperties({
            [ObjectDetectorSettings.PrimaryDetectionClass]: this.objectDetectorSettings[ObjectDetectorSettings.PrimaryDetectionClass],
            [ObjectDetectorSettings.PrimaryConfidenceThreshold]: this.objectDetectorSettings[ObjectDetectorSettings.PrimaryConfidenceThreshold],
            [ObjectDetectorInterface.Property.InferenceImageUrl]: 'https://iotcsavisionai.blob.core.windows.net/image-link-test/rtspcapture.jpg'
        });
    }

    public async processLvaInferences(inferences: IObjectInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        try {
            let primaryDetectionCount = 0;

            for (const inference of inferences) {
                const detectedClass = (inference.entity?.tag?.value || '').toUpperCase();
                const confidence = (inference.entity?.tag?.confidence || 0.0) * 100;

                if (confidence >= this.objectDetectorSettings[ObjectDetectorSettings.PrimaryConfidenceThreshold]) {
                    if (detectedClass === this.objectDetectorSettings[ObjectDetectorSettings.PrimaryDetectionClass]) {
                        ++primaryDetectionCount;

                        this.lastInferenceTime = Date.now();
                    }

                    await this.sendMeasurement({
                        [ObjectDetectorInterface.Telemetry.Inference]: inference
                    });
                }
            }

            if (primaryDetectionCount > 0) {
                const inferenceTelemetry: any = {
                    [ObjectDetectorInterface.Telemetry.PrimaryDetectionCount]: primaryDetectionCount
                };

                if (this.activeVideoInference === false) {
                    this.activeVideoInference = true;

                    const startTime = moment().utc().subtract(5, 'seconds').toISOString();
                    inferenceTelemetry[ObjectDetectorInterface.Event.InferenceEventVideoUrl] = `https://portal.loopbox-nl.com/ampplayer?an=${this.amsAssetName}&st=${startTime}`;
                }

                await this.sendMeasurement(inferenceTelemetry);
            }
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    @bind
    public async inferenceTimer(): Promise<void> {
        if (Date.now() - this.lastInferenceTime > 2500) {
            this.activeVideoInference = false;
        }
    }

    @bind
    protected async onHandleDeviceProperties(desiredChangedSettings: any): Promise<void> {
        await super.onHandleDevicePropertiesInternal(desiredChangedSettings);

        try {
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

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
                    case ObjectDetectorInterface.Setting.PrimaryDetectionClass:
                        patchedProperties[setting] = (this.objectDetectorSettings[setting] as any) = (value || '').toUpperCase();
                        break;

                    case ObjectDetectorInterface.Setting.PrimaryConfidenceThreshold:
                        patchedProperties[setting] = (this.objectDetectorSettings[setting] as any) = (value || 0.0);
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
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }

        this.deferredStart.resolve();
    }
}
