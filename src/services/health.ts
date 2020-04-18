import { service, inject } from 'spryly';
import { LoggingService } from './logging';
import { ModuleService } from './module';
import { bind } from '../utils';

export const healthCheckInterval = 15;
// const healthCheckTimeout = 30;
// const healthCheckStartPeriod = 60;
// const healthCheckRetries = 3;

export const HealthState = {
    Good: 2,
    Warning: 1,
    Critical: 0
};

@service('health')
export class HealthService {
    @inject('logger')
    private logger: LoggingService;

    @inject('module')
    private module: ModuleService;

    // private heathCheckStartTime = Date.now();
    // private failingStreak = 1;

    public async init() {
        this.logger.log(['HealthService', 'info'], 'initialize');
    }

    @bind
    public async checkHealthState(): Promise<number> {
        this.logger.log(['HealthService', 'info'], 'Health check interval');

        const moduleHealth = await this.module.getHealth();

        return moduleHealth;
    }
}
