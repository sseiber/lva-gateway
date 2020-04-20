import { ModuleService } from './module';
import {
    IClientConnectResult,
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

enum SensitivityType {
    High = 'high',
    Medium = 'medium',
    Low = 'low'
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

    constructor(lvaGatewayModule: ModuleService, graphInstance: any, graphTopology: any, cameraId: string, cameraName: string) {
        super(lvaGatewayModule, graphInstance, graphTopology, cameraId, cameraName);
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

    @bind
    public async onHandleDeviceProperties(desiredChangedSettings: any) {
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
                if (!value) {
                    this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'error'], `No value field found for desired property '${setting}'`);
                    continue;
                }

                switch (setting) {
                    case MotionDetectorInterface.Setting.Sensitivity:
                        patchedProperties[setting] = this.motionDetectorSettings[setting] = value || '';
                        break;

                    default:
                        this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'warning'], `Received desired property change for unknown setting '${setting}'`);
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
    }

    public async processLvaInferences(inferences: IMotionInference[]): Promise<void> {
        if (!Array.isArray(inferences) || !this.deviceClient) {
            this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'error'], `Missing inferences array or client not connected`);
            return;
        }

        if (process.env.DEBUG_DEVICE_TELEMETRY === this.cameraId) {
            this.lvaGatewayModule.log(['AmsMotionDetectorDevice', 'info'], `processLvaInferences: ${inferences}`);
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
}
