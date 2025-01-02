import {
  ElastiCacheClient,
  DescribeCacheClustersCommand,
  ModifyCacheClusterCommand,
} from '@aws-sdk/client-elasticache';
import { BPSet, BPSetStats, BPSetFixFn } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ElastiCacheAutoMinorVersionUpgradeCheck implements BPSet {
  private readonly client = new ElastiCacheClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getClusters = async () => {
    const response = await this.memoClient.send(new DescribeCacheClustersCommand({}));
    return response.CacheClusters || [];
  };

  public readonly getMetadata = () => ({
    name: 'ElastiCacheAutoMinorVersionUpgradeCheck',
    description: 'Ensures that ElastiCache clusters have auto minor version upgrade enabled.',
    priority: 2,
    priorityReason: 'Auto minor version upgrades help ensure clusters stay up-to-date with the latest security and bug fixes.',
    awsService: 'ElastiCache',
    awsServiceCategory: 'Cache Service',
    bestPracticeCategory: 'Reliability',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeCacheClustersCommand',
        reason: 'Fetches the list and configurations of ElastiCache clusters.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyCacheClusterCommand',
        reason: 'Enables auto minor version upgrade on ElastiCache clusters.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure application compatibility with updated ElastiCache versions before enabling this setting.',
  });

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
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
      if (cluster.AutoMinorVersionUpgrade) {
        compliantResources.push(cluster.ARN!);
      } else {
        nonCompliantResources.push(cluster.ARN!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster:')[1];
      await this.client.send(
        new ModifyCacheClusterCommand({
          CacheClusterId: clusterId,
          AutoMinorVersionUpgrade: true,
        })
      );
    }
  };
}
