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
                return boom_badImplementation(resultMessage);
            }

            return h.response(resultMessage).code(201);
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

            const sendTelemetryResult = await this.module.sendDeviceTelemetry(deviceId, telemetry);
            if (sendTelemetryResult.status === false) {
                return boom_badImplementation(sendTelemetryResult.message);
            }

            return h.response(sendTelemetryResult.message).code(201);
        }
        catch (ex) {
            throw boom_badRequest(ex.message);
        }
    }
}
