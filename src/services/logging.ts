import { service, inject } from 'spryly';
import { Server } from '@hapi/hapi';
import * as _get from 'lodash.get';

@service('logger')
export class LoggingService {
    @inject('$server')
    private server: Server;

    public async init(): Promise<void> {
        // tslint:disable-next-line:no-console
        console.log(`[${new Date().toTimeString()}] [LoggingService, info] initialize`);
    }

    public log(tags: any, message: any) {
        const tagsMessage = (tags && Array.isArray(tags)) ? `[${tags.join(', ')}]` : '[]';

        if (!_get(this.server, 'settings.app.compositionDone')) {
            // tslint:disable-next-line:no-console
            console.log(`[${new Date().toTimeString()}] [${tagsMessage}] ${message}`);
        }
        else {
            this.server.log(tagsMessage, message);
        }
    }
}
