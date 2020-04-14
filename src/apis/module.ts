import { inject, RoutePlugin, route } from 'spryly';
import { Request, ResponseToolkit } from '@hapi/hapi';
import { ModuleService } from '../services/module';
import {
    badRequest as boom_badRequest,
    badImplementation as boom_badImplementation
} from '@hapi/boom';
import * as _get from 'lodash.get';
import { emptyObj } from '../utils';

export class ModuleRoutes extends RoutePlugin {
    @inject('module')
    private module: ModuleService;

    @route({
        method: 'POST',
        path: '/api/v1/module/device',
        options: {
            tags: ['module'],
            description: 'Create a leaf device'
        }
    })
    public async postCreateDevice(request: Request, h: ResponseToolkit) {
        try {
            const deviceProps = _get(request, 'payload.deviceProps') || {};

            if (emptyObj(deviceProps)) {
                throw boom_badRequest('Missing deviceProps');
            }

            const dpsProvisionResult = await this.module.createDevice(deviceProps);
            const resultMessage = dpsProvisionResult.dpsProvisionMessage || dpsProvisionResult.clientConnectionMessage;
            if (dpsProvisionResult.dpsProvisionStatus === false || dpsProvisionResult.clientConnectionStatus === false) {
                throw boom_badImplementation(resultMessage);
            }

            return h.response(resultMessage).code(201);
        }
        catch (ex) {
            throw boom_badRequest(ex.message);
        }
    }

    @route({
        method: 'PUT',
        path: '/api/v1/module/device/{deviceId}',
        options: {
            tags: ['module'],
            description: 'Update a leaf device'
        }
    })
    public async putUpdateDevice(request: Request, h: ResponseToolkit) {
        try {
            const deviceId = _get(request, 'params.deviceId');
            const deviceProps = _get(request, 'payload.deviceProps') || {};

            if (!deviceId || emptyObj(deviceProps)) {
                throw boom_badRequest('Missing deviceId or deviceProps');
            }

            const operationResult = await this.module.updateDevice({
                cameraId: deviceId,
                operationInfo: deviceProps
            });

            if (operationResult.status === false) {
                throw boom_badImplementation(operationResult.message);
            }

            return h.response(operationResult.message).code(204);
        }
        catch (ex) {
            throw boom_badRequest(ex.message);
        }
    }

    @route({
        method: 'DELETE',
        path: '/api/v1/module/device/{deviceId}',
        options: {
            tags: ['module'],
            description: 'Delete a leaf device'
        }
    })
    public async deleteDevice(request: Request, h: ResponseToolkit) {
        try {
            const deviceId = _get(request, 'params.deviceId');

            if (!deviceId) {
                throw boom_badRequest('Missing deviceId');
            }

            const operationResult = await this.module.deleteDevice({
                cameraId: deviceId,
                operationInfo: {
                    required: '1'
                }
            });

            if (operationResult.status === false) {
                throw boom_badImplementation(operationResult.message);
            }

            return h.response(operationResult.message).code(204);
        }
        catch (ex) {
            throw boom_badRequest(ex.message);
        }
    }

    @route({
        method: 'POST',
        path: '/api/v1/module/device/{deviceId}/telemetry',
        options: {
            tags: ['module'],
            description: 'Send telemetry to a leaf device'
        }
    })
    public async postSendDeviceTelemetry(request: Request, h: ResponseToolkit) {
        try {
            const deviceId = _get(request, 'params.deviceId');
            const telemetry = _get(request, 'payload.telemetry') || {};

            if (!deviceId || emptyObj(telemetry)) {
                throw boom_badRequest('Missing deviceId or telemetry');
            }

            const operationResult = await this.module.sendDeviceTelemetry({
                cameraId: deviceId,
                operationInfo: telemetry
            });

            if (operationResult.status === false) {
                throw boom_badImplementation(operationResult.message);
            }

            return h.response(operationResult.message).code(201);
        }
        catch (ex) {
            throw boom_badRequest(ex.message);
        }
    }

    @route({
        method: 'POST',
        path: '/api/v1/module/device/{deviceId}/inferences',
        options: {
            tags: ['module'],
            description: 'Send inference telemetry to a leaf device'
        }
    })
    public async postSendDeviceInferenceTelemetry(request: Request, h: ResponseToolkit) {
        try {
            const deviceId = _get(request, 'params.deviceId');
            const inferences = _get(request, 'payload.inferences') || [];

            if (!deviceId || emptyObj(inferences)) {
                throw boom_badRequest('Missing deviceId or telemetry');
            }

            const operationResult = await this.module.sendDeviceInferences({
                cameraId: deviceId,
                operationInfo: inferences
            });

            if (operationResult.status === false) {
                throw boom_badImplementation(operationResult.message);
            }

            return h.response(operationResult.message).code(201);
        }
        catch (ex) {
            throw boom_badRequest(ex.message);
        }
    }
}
