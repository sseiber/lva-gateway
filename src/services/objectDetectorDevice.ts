import {
    ICameraDeviceProvisionInfo,
    ModuleService
} from './module';
import { AmsGraph } from './amsGraph';
import {
    IoTCameraSettings,
    AiInferenceInterface,
    AmsCameraDevice
} from './device';
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

enum MotionDetectorSensitivity {
    Low = 'low',
    Medium = 'medium',
    High = 'high'
}

enum ObjectDetectorSettings {
    MotionDetectorSensitivity = 'wpSensitivity',
    DetectionClasses = 'wpDetectionClasses',
    ConfidenceThreshold = 'wpConfidenceThreshold'
}

interface IObjectDetectorSettings {
    [ObjectDetectorSettings.MotionDetectorSensitivity]: MotionDetectorSensitivity;
    [ObjectDetectorSettings.DetectionClasses]: string;
    [ObjectDetectorSettings.ConfidenceThreshold]: number;
}

const ObjectDetectorInterface = {
    Setting: {
        MotionDetectorSensitivity: ObjectDetectorSettings.MotionDetectorSensitivity,
        DetectionClasses: ObjectDetectorSettings.DetectionClasses,
        ConfidenceThreshold: ObjectDetectorSettings.ConfidenceThreshold
    }
};

export class AmsObjectDetectorDevice extends AmsCameraDevice {
    private objectDetectorSettings: IObjectDetectorSettings = {
        [ObjectDetectorSettings.MotionDetectorSensitivity]: MotionDetectorSensitivity.Medium,
        [ObjectDetectorSettings.DetectionClasses]: 'person',
        [ObjectDetectorSettings.ConfidenceThreshold]: 70.0
    };

    private detectionClasses: string[] = this.objectDetectorSettings[ObjectDetectorSettings.DetectionClasses].toUpperCase().split(/[\s,]+/);

    constructor(lvaGatewayModule: ModuleService, amsGraph: AmsGraph, cameraInfo: ICameraDeviceProvisionInfo) {
        super(lvaGatewayModule, amsGraph, cameraInfo);
    }

    public setGraphParameters(): any {
        return {
            motionSensitivity: this.objectDetectorSettings[ObjectDetectorSettings.MotionDetectorSensitivity],
            assetName: `${this.lvaGatewayModule.getScopeId()}-${this.cameraInfo.cameraId}-${moment.utc().format('YYYYMMDD-HHmmss')}`
        };
    }

    public async deviceReady(): Promise<void> {
        await this.updateDeviceProperties({
            [AiInferenceInterface.Property.InferenceImageUrl]: 'https://iotcsavisionai.blob.core.windows.net/image-link-test/rtspcapture.jpg',
            [ObjectDetectorInterface.Setting.MotionDetectorSensitivity]: this.objectDetectorSettings[ObjectDetectorSettings.MotionDetectorSensitivity],
            [ObjectDetectorInterface.Setting.DetectionClasses]: this.objectDetectorSettings[ObjectDetectorSettings.DetectionClasses],
            [ObjectDetectorInterface.Setting.ConfidenceThreshold]: this.objectDetectorSettings[ObjectDetectorSettings.ConfidenceThreshold]
        });
    }

    public async processLvaInferences(inferences: IObjectInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        try {
            let detectionCount = 0;

            for (const inference of inferences) {
                const detectedClass = (inference.entity?.tag?.value || '').toUpperCase();
                const confidence = (inference.entity?.tag?.confidence || 0.0) * 100;

                if (this.detectionClasses.includes(detectedClass) && confidence >= this.objectDetectorSettings[ObjectDetectorSettings.ConfidenceThreshold]) {
                    ++detectionCount;

                    this.lastInferenceTime = Date.now();

                    await this.sendMeasurement({
                        [AiInferenceInterface.Telemetry.Inference]: inference
                    });
                }
            }

            if (detectionCount > 0) {
                const inferenceTelemetry: any = {
                    [AiInferenceInterface.Telemetry.InferenceCount]: detectionCount
                };

                // if (this.activeVideoInference === false) {
                //     this.activeVideoInference = true;

                inferenceTelemetry[AiInferenceInterface.Event.InferenceEventVideoUrl] = this.amsGraph.createInferenceVideoLink(this.iotCameraSettings[IoTCameraSettings.VideoPlaybackHost]);
                // }

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
                    case ObjectDetectorInterface.Setting.DetectionClasses: {
                        const detectionClassesString = (value || '');

                        this.detectionClasses = detectionClassesString.toUpperCase().split(/[\s,]+/);

                        patchedProperties[setting] = detectionClassesString;
                        break;
                    }

                    case ObjectDetectorInterface.Setting.MotionDetectorSensitivity:
                        patchedProperties[setting] = (this.objectDetectorSettings[setting] as any) = (value || '');
                        break;

                    case ObjectDetectorInterface.Setting.ConfidenceThreshold:
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
