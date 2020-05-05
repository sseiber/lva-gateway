import {
    ICameraDeviceProvisionInfo,
    ModuleService,
    AmsGraph
} from './module';
import { AmsCameraDevice } from './device';
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
    PrimaryConfidenceThreshold = 'wpPrimaryConfidenceThreshold',
    SecondaryDetectionClass = 'wpSecondaryDetectionClass',
    SecondaryConfidenceThreshold = 'wpSecondaryConfidenceThreshold'
}

interface IObjectDetectorSettings {
    [ObjectDetectorSettings.PrimaryDetectionClass]: string;
    [ObjectDetectorSettings.PrimaryConfidenceThreshold]: number;
    [ObjectDetectorSettings.SecondaryDetectionClass]: string;
    [ObjectDetectorSettings.SecondaryConfidenceThreshold]: number;
}

const ObjectDetectorInterface = {
    Telemetry: {
        PrimaryDetectionCount: 'tlPrimaryDetectionCount',
        SecondaryDetectionCount: 'tlSeconaryDetectionCount',
        PrimaryConfidence: 'tlPrimaryConfidence',
        SecondaryConfidence: 'tlSecondaryConfidence',
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
        PrimaryConfidenceThreshold: ObjectDetectorSettings.PrimaryConfidenceThreshold,
        SecondaryDetectionClass: ObjectDetectorSettings.SecondaryDetectionClass,
        SecondaryConfidenceThreshold: ObjectDetectorSettings.SecondaryConfidenceThreshold
    }
};

export class AmsObjectDetectorDevice extends AmsCameraDevice {
    private objectDetectorSettings: IObjectDetectorSettings = {
        [ObjectDetectorSettings.PrimaryDetectionClass]: '',
        [ObjectDetectorSettings.PrimaryConfidenceThreshold]: 0.0,
        [ObjectDetectorSettings.SecondaryDetectionClass]: '',
        [ObjectDetectorSettings.SecondaryConfidenceThreshold]: 0.0
    };

    constructor(lvaGatewayModule: ModuleService, amsGraph: AmsGraph, cameraInfo: ICameraDeviceProvisionInfo) {
        super(lvaGatewayModule, amsGraph, cameraInfo);
    }

    public async initDevice(): Promise<void> {
        await this.sendMeasurement({
            [ObjectDetectorInterface.Event.InferenceEventVideoUrl]: 'https://portal.loopbox-nl.com/'
        });

        await this.updateDeviceProperties({
            [ObjectDetectorInterface.Property.InferenceImageUrl]: 'https://iotcsavisionai.blob.core.windows.net/image-link-test/dunkin-3_199_.jpg',
            [ObjectDetectorInterface.Property.InferenceVideoUrl]: 'https://portal.loopbox-nl.com/'
        });
    }

    public async processLvaInferences(inferences: IObjectInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        try {
            let primaryDetectionCount = 0;
            let secondaryDetectionCount = 0;

            for (const inference of inferences) {
                const detectedClass = (inference.entity?.tag?.value || '').toUpperCase();
                const confidence = (inference.entity?.tag?.confidence || 0.0) * 100;
                const inferenceTelemetry = {};

                if (detectedClass === this.objectDetectorSettings[ObjectDetectorSettings.PrimaryDetectionClass]) {
                    ++primaryDetectionCount;

                    inferenceTelemetry[ObjectDetectorInterface.Telemetry.Inference] = inference;

                    if (confidence >= this.objectDetectorSettings[ObjectDetectorSettings.PrimaryConfidenceThreshold]) {
                        inferenceTelemetry[ObjectDetectorInterface.Telemetry.PrimaryConfidence] = confidence;
                    }
                }

                if (detectedClass === this.objectDetectorSettings[ObjectDetectorSettings.SecondaryDetectionClass]) {
                    ++secondaryDetectionCount;

                    inferenceTelemetry[ObjectDetectorInterface.Telemetry.Inference] = inference;

                    if (confidence >= this.objectDetectorSettings[ObjectDetectorSettings.SecondaryConfidenceThreshold]) {
                        inferenceTelemetry[ObjectDetectorInterface.Telemetry.SecondaryConfidence] = confidence;
                    }
                }

                if (Object.keys(inferenceTelemetry).length > 0) {
                    await this.sendMeasurement(inferenceTelemetry);
                }
            }

            const inferenceCountTelemetry = {};

            if (primaryDetectionCount > 0) {
                inferenceCountTelemetry[ObjectDetectorInterface.Telemetry.PrimaryDetectionCount] = primaryDetectionCount;
            }

            if (secondaryDetectionCount > 0) {
                inferenceCountTelemetry[ObjectDetectorInterface.Telemetry.SecondaryDetectionCount] = secondaryDetectionCount;
            }

            if (Object.keys(inferenceCountTelemetry).length > 0) {
                await this.sendMeasurement(inferenceCountTelemetry);
            }
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    @bind
    protected async onHandleDeviceProperties(desiredChangedSettings: any) {
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
                    case ObjectDetectorInterface.Setting.SecondaryDetectionClass:
                        patchedProperties[setting] = (this.objectDetectorSettings[setting] as any) = (value || '').toUpperCase();
                        break;

                    case ObjectDetectorInterface.Setting.PrimaryConfidenceThreshold:
                    case ObjectDetectorInterface.Setting.SecondaryConfidenceThreshold:
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
