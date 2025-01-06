import {
  ECSClient,
  DescribeClustersCommand,
  UpdateClusterSettingsCommand,
} from '@aws-sdk/client-ecs';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ECSContainerInsightsEnabled implements BPSet {
  private readonly client = new ECSClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getClusters = async () => {
    const response = await this.memoClient.send(
      new DescribeClustersCommand({ include: ['SETTINGS'] })
    );
    return response.clusters || [];
  };

  public readonly getMetadata = () => ({
    name: 'ECSContainerInsightsEnabled',
    description: 'Ensures that ECS clusters have Container Insights enabled.',
    priority: 3,
    priorityReason:
      'Enabling Container Insights provides enhanced monitoring and diagnostics for ECS clusters.',
    awsService: 'ECS',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Monitoring',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeClustersCommand',
        reason: 'Retrieve ECS clusters and their settings to check if Container Insights is enabled.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateClusterSettingsCommand',
        reason: 'Enable Container Insights for non-compliant ECS clusters.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure enabling Container Insights aligns with your monitoring strategy and does not incur unexpected costs.',
  });

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const clusters = await this.getClusters();

    for (const cluster of clusters) {
      if (cluster.clusterName === 'default')
        continue

      const containerInsightsSetting = cluster.settings?.find(
        (setting) => setting.name === 'containerInsights'
      );
      if (containerInsightsSetting?.value === 'enabled') {
        compliantResources.push(cluster.clusterArn!);
      } else {
        nonCompliantResources.push(cluster.clusterArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      await this.client.send(
        new UpdateClusterSettingsCommand({
          cluster: arn,
          settings: [{ name: 'containerInsights', value: 'enabled' }],
        })
      );
    }
  };
}
