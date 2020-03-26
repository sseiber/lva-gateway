import { service, inject } from 'spryly';
import { Server } from '@hapi/hapi';
import { LoggingService } from './logging';
import { ConfigService } from './config';
import { StorageService } from './storage';
import { HealthState } from './health';
import {
    IDeviceProps,
    AxisDevice
} from './device';
import { Mqtt } from 'azure-iot-device-mqtt';
import {
    ModuleClient,
    Twin,
    Message,
    DeviceMethodRequest,
    DeviceMethodResponse
} from 'azure-iot-device';
import {
    arch as osArch,
    platform as osPlatform,
    release as osRelease,
    cpus as osCpus,
    totalmem as osTotalMem,
    freemem as osFreeMem,
    loadavg as osLoadAvg
} from 'os';
import * as crypto from 'crypto';
import * as ipAddress from 'ip';
import * as _get from 'lodash.get';
import * as _random from 'lodash.random';
import { bind, emptyObj } from '../utils';

export interface IDpsInfo {
    scopeId: string;
    templateId: string;
    iotcGatewayId: string;
    iotcModuleId: string;
    deviceId: string;
    deviceKey: string;
}

export interface IProvisionResult {
    dpsProvisionStatus: boolean;
    dpsProvisionMessage: string;
    dpsHubConnectionString: string;
    clientConnectionStatus: boolean;
    clientConnectionMessage: string;
    axisDevice: AxisDevice;
}

export interface ITelemetryInfo {
    deviceId: string;
    data: any;
}

export interface ISendTelemetryResult {
    status: boolean;
    message: string;
}

export interface IModuleProps {
    scopeId: string;
    templateId: string;
    iotcGatewayId: string;
    iotcModuleId: string;
}

interface ISystemProperties {
    cpuModel: string;
    cpuCores: number;
    cpuUsage: number;
    totalMemory: number;
    freeMemory: number;
}

const AxisModuleProperties = {
    Manufacturer: 'manufacturer',
    Model: 'model',
    SwVersion: 'swVersion',
    OsName: 'osName',
    ProcessorArchitecture: 'processorArchitecture',
    ProcessorManufacturer: 'processorManufacturer',
    TotalStorage: 'totalStorage',
    TotalMemory: 'totalMemory'
};

interface IModuleSettings {
    wpMasterDeviceProvisioningKey: string;
    wpScopeId: string;
    wpDeviceTemplateId: string;
    wpGatewayInstanceId: string;
    wpGatewayModuleId: string;
}

enum IoTCentralClientState {
    Disconnected = 'disconnected',
    Connected = 'connected'
}

enum ModuleState {
    Inactive = 'inactive',
    Active = 'active'
}

enum RestartModuleCommandParams {
    Timeout = 'cmpRestartModuleTimeout'
}

export const ModuleInterface = {
    Telemetry: {
        SystemHeartbeat: 'tlSystemHeartbeat',
        FreeMemory: 'tlFreeMemory'
    },
    State: {
        IoTCentralClientState: 'stIoTCentralClientState',
        ModuleState: 'stModuleState'
    },
    Event: {
        CameraProvision: 'evCameraProvision',
        ModuleRestart: 'evModuleRestart'
    },
    Setting: {
        MasterDeviceProvisioningKey: 'wpMasterDeviceProvisioningKey',
        ScopeId: 'wpScopeId',
        DeviceTemplateId: 'wpDeviceTemplateId',
        GatewayInstanceId: 'wpGatewayInstanceId',
        GatewayModuleId: 'wpGatewayModuleId'
    },
    Property: {
        ModuleIpAddress: 'rpModuleIpAddress'
    },
    Command: {
        RestartModule: 'cmRestartModule'
    }
};

export const AxisManagementCommands = {
    ProvisionCamera: 'provisioncamera',
    SendDeviceTelemetry: 'senddevicetelemetry'
};

const defaultHealthCheckRetries: number = 3;

@service('module')
export class ModuleService {
    @inject('$server')
    private server: Server;

    @inject('logger')
    private logger: LoggingService;

    @inject('config')
    private config: ConfigService;

    @inject('storage')
    private storage: StorageService;

    private iotcModuleId: string = '';
    private moduleClient: ModuleClient = null;
    private moduleTwin: Twin = null;
    private healthState = HealthState.Good;
    private healthCheckFailStreak: number = 0;
    private moduleIpAddress: string = '127.0.0.1';
    private moduleSettings: IModuleSettings = {
        wpMasterDeviceProvisioningKey: '',
        wpScopeId: '',
        wpDeviceTemplateId: '',
        wpGatewayInstanceId: '',
        wpGatewayModuleId: ''
    };
    private deviceMap = new Map<string, AxisDevice>();
    private healthCheckRetries: number = defaultHealthCheckRetries;

    public async init(): Promise<void> {
        this.logger.log(['ModuleService', 'info'], 'initialize');

        this.server.method({ name: 'module.startModule', method: this.startModule });

        this.iotcModuleId = this.config.get('IOTEDGE_MODULEID') || '';

        this.moduleIpAddress = ipAddress.address() || '127.0.0.1';
        this.moduleSettings.wpMasterDeviceProvisioningKey = this.config.get('IoTMasterDeviceProvisioningKey') || '';
        this.moduleSettings.wpScopeId = this.config.get('IoTAppScopeId') || '';
        this.moduleSettings.wpDeviceTemplateId = this.config.get('IoTAppTemplateId') || '';
        this.moduleSettings.wpGatewayInstanceId = this.config.get('IoTAppIotcGatewayId') || '';
        this.moduleSettings.wpGatewayModuleId = this.config.get('IoTAppIotcModuleId') || '';

        this.healthCheckRetries = this.config.get('healthCheckRetries') || defaultHealthCheckRetries;
    }

    @bind
    public async startModule(): Promise<void> {
        let result = true;

        try {
            result = await this.connectModuleClient();
        }
        catch (ex) {
            result = false;

            this.logger.log(['ModuleService', 'error'], `Exception during IoT Central device provsioning: ${ex.message}`);
        }

        this.healthState = result === true ? HealthState.Good : HealthState.Critical;
    }

    public async createDevice(deviceProps: IDeviceProps): Promise<IProvisionResult> {
        return this.provisionAxisDevice(deviceProps);
    }

    public async sendDeviceTelemetry(deviceId: string, telemetry: any): Promise<ISendTelemetryResult> {
        return this.sendAxisDeviceTelemetry({
            deviceId,
            data: telemetry
        });
    }

    @bind
    public async getHealth(): Promise<number> {
        let healthState = HealthState.Good;

        try {
            const systemProperties = await this.getSystemProperties();
            const freeMemory = _get(systemProperties, 'freeMemory') || 0;

            await this.sendMeasurement({ [ModuleInterface.Telemetry.FreeMemory]: freeMemory });

            // TODO:
            // Find the right threshold for this metric
            if (freeMemory === 0) {
                healthState = HealthState.Critical;
            }
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error calling systemProperties: ${ex.message}`);
            healthState = HealthState.Critical;
        }

        await this.sendMeasurement({ [ModuleInterface.Telemetry.SystemHeartbeat]: healthState });

        if (healthState < HealthState.Good) {
            this.logger.log(['HealthService', 'warning'], `Health check watch: ${healthState}`);

            if (++this.healthCheckFailStreak >= this.healthCheckRetries) {
                await this.restartModule(10, 'checkHealthState');
            }
        }

        this.healthState = healthState;

        return this.healthState;
    }

    @bind
    public async sendMeasurement(data: any): Promise<void> {
        if (!data || !this.moduleClient) {
            return;
        }

        try {
            const iotcMessage = new Message(JSON.stringify(data));

            await this.moduleClient.sendEvent(iotcMessage);

            if (_get(process.env, 'DEBUG_MODULE_TELEMETRY') === '1') {
                this.logger.log(['ModuleService', 'info'], `sendEvent: ${JSON.stringify(data, null, 4)}`);
            }
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `sendMeasurement: ${ex.message}`);
        }
    }

    public async sendInferenceData(inferenceTelemetryData: any) {
        if (!inferenceTelemetryData || !this.moduleClient) {
            return;
        }

        try {
            await this.sendMeasurement(inferenceTelemetryData);
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `sendInferenceData: ${ex.message}`);
        }
    }

    public async restartModule(timeout: number, reason: string): Promise<void> {
        this.logger.log(['ModuleService', 'info'], `Module restart requested...`);

        try {
            await this.sendMeasurement({
                [ModuleInterface.Event.ModuleRestart]: reason,
                [ModuleInterface.State.ModuleState]: ModuleState.Inactive
            });

            if (timeout > 0) {
                await new Promise((resolve) => {
                    setTimeout(() => {
                        return resolve();
                    }, 1000 * timeout);
                });
            }
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `${ex.message}`);
        }

        // let Docker restart our container
        this.logger.log(['ModuleService', 'error'], `Exiting container now`);
        process.exit(1);
    }

    private async getSystemProperties(): Promise<ISystemProperties> {
        const cpus = osCpus();
        const cpuUsageSamples = osLoadAvg();

        return {
            cpuModel: Array.isArray(cpus) ? cpus[0].model : 'Unknown',
            cpuCores: Array.isArray(cpus) ? cpus.length : 0,
            cpuUsage: cpuUsageSamples[0],
            totalMemory: osTotalMem() / 1024,
            freeMemory: osFreeMem() / 1024
        };
    }

    private async getModuleProperties(): Promise<any> {
        let result = {};

        try {
            result = await this.storage.get('state', 'iotCentral.properties');
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error reading module properties: ${ex.message}`);
        }

        return result;
    }

    private async connectModuleClient(): Promise<boolean> {
        let result = true;
        let connectionStatus = `IoT Central successfully connected module: ${this.iotcModuleId}`;

        if (this.moduleClient) {
            await this.moduleClient.close();
            this.moduleClient = null;
            this.moduleTwin = null;
        }

        try {
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_WORKLOADURI: ${this.config.get('IOTEDGE_WORKLOADURI')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_DEVICEID: ${this.config.get('IOTEDGE_DEVICEID')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_MODULEID: ${this.config.get('IOTEDGE_MODULEID')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_MODULEGENERATIONID: ${this.config.get('IOTEDGE_MODULEGENERATIONID')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_IOTHUBHOSTNAME: ${this.config.get('IOTEDGE_IOTHUBHOSTNAME')}`);
            this.logger.log(['ModuleService', 'info'], `IOTEDGE_AUTHSCHEME: ${this.config.get('IOTEDGE_AUTHSCHEME')}`);

            this.moduleClient = await ModuleClient.fromEnvironment(Mqtt);
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Failed to instantiate client interface from configuraiton: ${ex.message}`);
        }

        if (!this.moduleClient) {
            result = false;
        }

        if (result === true) {
            try {
                await this.moduleClient.open();

                this.logger.log(['ModuleService', 'info'], `Client is connected`);

                // TODO:
                // Should the module twin interface get connected *BEFORE* opening
                // the moduleClient above?
                this.moduleTwin = await this.moduleClient.getTwin();
                this.moduleTwin.on('properties.desired', this.onHandleModuleProperties);

                this.moduleClient.on('error', this.onModuleClientError);

                this.moduleClient.onMethod(ModuleInterface.Command.RestartModule, this.restartModuleDirectMethod);
                this.moduleClient.on('inputMessage', this.onHandleDownstreamMessages);

                const systemProperties = await this.getSystemProperties();
                const moduleProperties = await this.getModuleProperties();

                const deviceProperties = {
                    ...moduleProperties,
                    [AxisModuleProperties.OsName]: osPlatform() || '',
                    [AxisModuleProperties.SwVersion]: osRelease() || '',
                    [AxisModuleProperties.ProcessorArchitecture]: osArch() || '',
                    [AxisModuleProperties.TotalMemory]: systemProperties.totalMemory,
                    [ModuleInterface.Property.ModuleIpAddress]: this.moduleIpAddress
                };

                await this.updateModuleProperties(deviceProperties);

                await this.sendMeasurement({
                    [ModuleInterface.State.IoTCentralClientState]: IoTCentralClientState.Connected,
                    [ModuleInterface.State.ModuleState]: ModuleState.Active
                });
            }
            catch (ex) {
                connectionStatus = `IoT Central connection error: ${ex.message}`;
                this.logger.log(['ModuleService', 'error'], connectionStatus);

                result = false;
            }
        }

        return result;
    }

    @bind
    private async onHandleDownstreamMessages(inputName: string, message: any) {
        // this.logger.log(['ModuleService', 'info'], `Received downstream message: ${JSON.stringify(message, null, 4)}`);

        if (!this.moduleClient) {
            return;
        }

        try {
            await this.moduleClient.complete(message);

            const messageData = message.getBytes().toString('utf8');
            if (!messageData) {
                return;
            }

            const messageJson = JSON.parse(messageData);

            switch (inputName) {
                case AxisManagementCommands.ProvisionCamera:
                    await this.provisionAxisDevice(messageJson);
                    break;

                case AxisManagementCommands.SendDeviceTelemetry:
                    await this.sendAxisDeviceTelemetry(messageJson);
                    break;

                default:
                    this.logger.log(['ModuleService', 'warning'], `Warning: received routed message for unknown input: ${inputName}`);
                    break;
            }
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error while handling downstream message: ${ex.message}`);
        }
    }

    private async provisionAxisDevice(deviceProps: any): Promise<IProvisionResult> {
        this.logger.log(['ModuleService', 'info'], `provisionAxisDevice with provisionInfo: ${JSON.stringify(deviceProps, null, 4)}`);

        let deviceProvisionResult: IProvisionResult = {
            dpsProvisionStatus: false,
            dpsProvisionMessage: '',
            dpsHubConnectionString: '',
            clientConnectionStatus: false,
            clientConnectionMessage: '',
            axisDevice: null
        };

        if (!this.moduleSettings.wpMasterDeviceProvisioningKey
            || !this.moduleSettings.wpScopeId
            || !this.moduleSettings.wpDeviceTemplateId
            || !this.moduleSettings.wpGatewayInstanceId
            || !this.moduleSettings.wpGatewayModuleId) {
            deviceProvisionResult.dpsProvisionStatus = false;
            deviceProvisionResult.dpsProvisionMessage = `Missing camera management settings`;
            this.logger.log(['ModuleService', 'error'], deviceProvisionResult.dpsProvisionMessage);

            return deviceProvisionResult;
        }

        try {
            const deviceKey = this.computeDeviceKey(deviceProps.deviceId, this.moduleSettings.wpMasterDeviceProvisioningKey);
            const dpsInfo: IDpsInfo = {
                scopeId: this.moduleSettings.wpScopeId,
                templateId: this.moduleSettings.wpDeviceTemplateId,
                iotcGatewayId: this.moduleSettings.wpGatewayInstanceId,
                iotcModuleId: this.moduleSettings.wpGatewayModuleId,
                deviceId: deviceProps.deviceId,
                deviceKey
            };

            deviceProvisionResult = await AxisDevice.createAndProvisionAxisDevice(this.logger, dpsInfo, deviceProps);
            if (deviceProvisionResult.dpsProvisionStatus === true && deviceProvisionResult.clientConnectionStatus === true) {
                this.logger.log(['ModuleService', 'info'], `Succesfully provisioned device with id: ${deviceProps.deviceId}`);

                this.deviceMap.set(deviceProps.deviceId, deviceProvisionResult.axisDevice);
            }
        }
        catch (ex) {
            deviceProvisionResult.dpsProvisionStatus = false;
            deviceProvisionResult.dpsProvisionMessage = `Error while processing downstream message: ${ex.message}`;
            this.logger.log(['ModuleService', 'error'], deviceProvisionResult.dpsProvisionMessage);
        }

        return deviceProvisionResult;
    }

    private computeDeviceKey(deviceId: string, masterKey: string) {
        return crypto.createHmac('SHA256', Buffer.from(masterKey, 'base64')).update(deviceId, 'utf8').digest('base64');
    }

    private async sendAxisDeviceTelemetry(telemetryInfo: ITelemetryInfo): Promise<ISendTelemetryResult> {
        this.logger.log(['ModuleService', 'info'], `Sending Axis telemetry: ${JSON.stringify(telemetryInfo, null, 4)}`);

        const sendTelemetryResult = {
            status: false,
            message: ''
        };

        const deviceId = _get(telemetryInfo, 'deviceId');
        if (!deviceId) {
            sendTelemetryResult.message = `Error: missing deviceId`;

            this.logger.log(['ModuleService', 'error'], sendTelemetryResult.message);

            return sendTelemetryResult;
        }

        const axisDevice = this.deviceMap.get(deviceId);
        if (!axisDevice) {
            sendTelemetryResult.message = `Error: Not device exists with deviceId: ${deviceId}`;

            this.logger.log(['ModuleService', 'error'], sendTelemetryResult.message);

            return sendTelemetryResult;
        }

        const telemetryData = _get(telemetryInfo, 'data');
        if (!telemetryData) {
            sendTelemetryResult.message = `Error: missing telemetry data`;

            this.logger.log(['ModuleService', 'error'], sendTelemetryResult.message);

            return sendTelemetryResult;
        }

        await axisDevice.sendTelemetry(telemetryData);

        return {
            status: true,
            message: `Success`
        };
    }

    @bind
    private onModuleClientError(error: Error) {
        this.logger.log(['ModuleService', 'error'], `Module client connection error: ${error.message}`);
        this.healthState = HealthState.Critical;
    }

    private async updateModuleProperties(properties: any): Promise<void> {
        if (!properties || !this.moduleTwin) {
            return;
        }

        try {
            await new Promise((resolve, reject) => {
                this.moduleTwin.properties.reported.update(properties, (error) => {
                    if (error) {
                        return reject(error);
                    }

                    return resolve();
                });
            });

            this.logger.log(['ModuleService', 'info'], `Module live properties updated: ${JSON.stringify(properties, null, 4)}`);
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error while updating client properties: ${ex.message}`);
        }
    }

    @bind
    private async onHandleModuleProperties(desiredChangedSettings: any) {
        try {
            this.logger.log(['ModuleService', 'info'], `desiredPropsDelta:\n${JSON.stringify(desiredChangedSettings, null, 4)}`);

            const patchedProperties = {};

            for (const setting in desiredChangedSettings) {
                if (!desiredChangedSettings.hasOwnProperty(setting)) {
                    continue;
                }

                if (setting === '$version') {
                    continue;
                }

                let changedSettingResult;

                switch (setting) {
                    case ModuleInterface.Setting.MasterDeviceProvisioningKey:
                    case ModuleInterface.Setting.ScopeId:
                    case ModuleInterface.Setting.DeviceTemplateId:
                    case ModuleInterface.Setting.GatewayInstanceId:
                    case ModuleInterface.Setting.GatewayModuleId:
                        changedSettingResult = await this.moduleSettingChange(setting, _get(desiredChangedSettings, `${setting}`));
                        break;

                    default:
                        this.logger.log(['ModuleService', 'error'], `Received desired property change for unknown setting '${setting}'`);
                        break;
                }

                if (_get(changedSettingResult, 'status') === true) {
                    patchedProperties[setting] = changedSettingResult.value;
                }
            }

            if (!emptyObj(patchedProperties)) {
                await this.updateModuleProperties(patchedProperties);
            }
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Exception while handling desired properties: ${ex.message}`);
        }
    }

    private async moduleSettingChange(setting: string, value: any): Promise<any> {
        this.logger.log(['ModuleService', 'info'], `Handle module setting change for '${setting}': ${typeof value === 'object' && value !== null ? JSON.stringify(value, null, 4) : value}`);

        const result = {
            value: undefined,
            status: true
        };

        switch (setting) {
            case ModuleInterface.Setting.MasterDeviceProvisioningKey:
            case ModuleInterface.Setting.ScopeId:
            case ModuleInterface.Setting.DeviceTemplateId:
            case ModuleInterface.Setting.GatewayInstanceId:
            case ModuleInterface.Setting.GatewayModuleId:
                result.value = this.moduleSettings[setting] = value || '';
                break;

            default:
                this.logger.log(['ModuleService', 'info'], `Unknown module setting change request '${setting}'`);
                result.status = false;
        }

        return result;
    }

    @bind
    private async restartModuleDirectMethod(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.logger.log(['ModuleService', 'info'], `${ModuleInterface.Command.RestartModule} command received`);

        try {
            await commandResponse.send(200);
        }
        catch (ex) {
            this.logger.log(['ModuleService', 'error'], `Error sending response for ${ModuleInterface.Command.RestartModule} command: ${ex.message}`);
        }

        const timeout = _get(commandRequest, `payload.${RestartModuleCommandParams.Timeout}`);
        await this.restartModule(timeout, 'RestartModule command received');
    }
}
