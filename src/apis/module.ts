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
        path: '/api/v1/module/camera',
        options: {
            tags: ['module'],
            description: 'Create a camera device'
        }
    })
    public async postCreateCamera(request: Request, h: ResponseToolkit) {
        try {
            const cameraId = _get(request, 'payload.cameraId') || '';
            const cameraName = _get(request, 'payload.cameraName') || 'Unkonwn';

            if (!cameraId || !cameraName) {
                throw boom_badRequest('Missing cameraId or cameraName');
            }

            const dpsProvisionResult = await this.module.createCamera(cameraId, cameraName);
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
        method: 'DELETE',
        path: '/api/v1/module/camera/{cameraId}',
        options: {
            tags: ['module'],
            description: 'Delete a camera device'
        }
    })
    public async deleteCamera(request: Request, h: ResponseToolkit) {
        try {
            const cameraId = _get(request, 'params.cameraId');

            if (!cameraId) {
                throw boom_badRequest('Missing cameraId');
            }

            const operationResult = await this.module.deleteCamera({
                cameraId,
                operationInfo: {}
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
        path: '/api/v1/module/camera/{cameraId}/telemetry',
        options: {
            tags: ['module'],
            description: 'Send telemetry to a device device'
        }
    })
    public async postSendCameraTelemetry(request: Request, h: ResponseToolkit) {
        try {
            const cameraId = _get(request, 'params.cameraId');
            const telemetry = _get(request, 'payload.telemetry') || {};

            if (!cameraId || emptyObj(telemetry)) {
                throw boom_badRequest('Missing cameraId or telemetry');
            }

            const operationResult = await this.module.sendCameraTelemetry({
                cameraId,
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
        path: '/api/v1/module/camera/{cameraId}/inferences',
        options: {
            tags: ['module'],
            description: 'Send inference telemetry to a camera device'
        }
    })
    public async postSendCameraInferenceTelemetry(request: Request, h: ResponseToolkit) {
        try {
            const cameraId = _get(request, 'params.cameraId');
            const inferences = _get(request, 'payload.inferences') || [];

            if (!cameraId || emptyObj(inferences)) {
                throw boom_badRequest('Missing cameraId or telemetry');
            }

            const operationResult = await this.module.sendCameraInferences({
                cameraId,
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
