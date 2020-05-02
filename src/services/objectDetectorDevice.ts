import {
    ICameraDeviceProvisionInfo,
    ModuleService,
    AmsGraph
} from './module';
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
    DetectionClasses = 'wpDetectionClasses'
}

interface IObjectDetectorSettings {
    [ObjectDetectorSettings.DetectionClasses]: string;
}

const ObjectDetectorInterface = {
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
        DetectionClasses: ObjectDetectorSettings.DetectionClasses
    }
};

export class AmsObjectDetectorDevice extends AmsCameraDevice {
    private objectDetectorSettings: IObjectDetectorSettings = {
        [ObjectDetectorSettings.DetectionClasses]: ''
    };

    constructor(lvaGatewayModule: ModuleService, amsGraph: AmsGraph, cameraInfo: ICameraDeviceProvisionInfo) {
        super(lvaGatewayModule, amsGraph, cameraInfo);
    }

    public async connectDeviceClient(dpsHubConnectionString: string): Promise<IClientConnectResult> {
        let clientConnectionResult: IClientConnectResult = {
            clientConnectionStatus: false,
            clientConnectionMessage: ''
        };

        try {
            clientConnectionResult = await this.connectDeviceClientInternal(dpsHubConnectionString, this.onHandleDeviceProperties);

            if (clientConnectionResult.clientConnectionStatus === true) {
                await this.deferredStart.promise;
            }

            if (this.deviceSettings[IoTCameraDeviceSettings.AutoStart] === true) {
                try {
                    await this.startLvaProcessingInternal(true);
                }
                catch (ex) {
                    this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Error while trying to auto-start Lva graph: ${ex.message}`);
                }
            }
        }
        catch (ex) {
            clientConnectionResult.clientConnectionStatus = false;
            clientConnectionResult.clientConnectionMessage = `An error occurred while accessing the device twin properties`;
        }

        return clientConnectionResult;
    }

    public async processLvaInferences(inferences: IObjectInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        try {
            let inferenceCount = 0;

            for (const inference of inferences) {
                // TODO:
                // Watch out for sub-string overlap!
                if (this.objectDetectorSettings[ObjectDetectorSettings.DetectionClasses].includes((inference.entity?.tag?.value || '').toUpperCase())) {
                    ++inferenceCount;

                    await this.sendMeasurement({
                        [ObjectDetectorInterface.Telemetry.Inference]: inference
                    });
                }
            }

            if (inferenceCount > 0) {
                await this.sendMeasurement({
                    [ObjectDetectorInterface.Telemetry.InferenceCount]: inferenceCount
                });
            }
        }
        catch (ex) {
            this.lvaGatewayModule.logger(['AmsObjectDetectorDevice', 'error'], `Error processing downstream message: ${ex.message}`);
        }
    }

    @bind
    protected async onHandleDeviceProperties(desiredChangedSettings: any) {
        await super.onHandleDeviceProperties(desiredChangedSettings);

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
                    case ObjectDetectorInterface.Setting.DetectionClasses:
                        patchedProperties[setting] = this.objectDetectorSettings[setting] = (value || '').toUpperCase();
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
