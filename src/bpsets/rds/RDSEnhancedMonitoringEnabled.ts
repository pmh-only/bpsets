import {
  RDSClient,
  DescribeDBInstancesCommand,
  ModifyDBInstanceCommand
} from '@aws-sdk/client-rds';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class RDSEnhancedMonitoringEnabled implements BPSet {
  private readonly client = new RDSClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSEnhancedMonitoringEnabled',
    description: 'Ensures that Enhanced Monitoring is enabled for RDS instances.',
    priority: 2,
    priorityReason: 'Enhanced Monitoring provides valuable metrics for better monitoring and troubleshooting.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Monitoring',
    requiredParametersForFix: [
      {
        name: 'monitoring-interval',
        description: 'The interval in seconds for Enhanced Monitoring.',
        default: '60',
        example: '60'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBInstancesCommand',
        reason: 'Fetch RDS instance details including monitoring configuration.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBInstanceCommand',
        reason: 'Enable Enhanced Monitoring for non-compliant RDS instances.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that enabling Enhanced Monitoring does not conflict with existing configurations.'
  });

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        });
      });
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const dbInstances = await this.getDBInstances();

    for (const instance of dbInstances) {
      if (instance.MonitoringInterval && instance.MonitoringInterval > 0) {
        compliantResources.push(instance.DBInstanceArn!);
      } else {
        nonCompliantResources.push(instance.DBInstanceArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING';

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        });
      });
  };

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const monitoringInterval = requiredParametersForFix.find(
      (param) => param.name === 'monitoring-interval'
    )?.value;

    if (!monitoringInterval) {
      throw new Error("Required parameter 'monitoring-interval' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const instanceId = arn.split(':instance/')[1];

      await this.client.send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: instanceId,
          MonitoringInterval: parseInt(monitoringInterval, 10)
        })
      );
    }
  };

  private readonly getDBInstances = async () => {
    const response = await this.memoClient.send(new DescribeDBInstancesCommand({}));
    return response.DBInstances || [];
  };
}
