import {
  ElastiCacheClient,
  DescribeCacheClustersCommand,
  DeleteCacheClusterCommand,
  CreateCacheClusterCommand
} from '@aws-sdk/client-elasticache';
import { BPSet, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ElastiCacheSubnetGroupCheck implements BPSet {
  private readonly client = new ElastiCacheClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getClusters = async () => {
    const response = await this.memoClient.send(new DescribeCacheClustersCommand({}));
    return response.CacheClusters || [];
  };

  public readonly getMetadata = () => ({
    name: 'ElastiCacheSubnetGroupCheck',
    description: 'Ensures ElastiCache clusters are not using the default subnet group.',
    priority: 2,
    priorityReason: 'Using the default subnet group is not recommended for production workloads.',
    awsService: 'ElastiCache',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Networking',
    requiredParametersForFix: [
      {
        name: 'subnet-group-name',
        description: 'The name of the desired subnet group to associate with the cluster.',
        default: '',
        example: 'custom-subnet-group',
      }
    ],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeCacheClustersCommand',
        reason: 'Fetches the details of all ElastiCache clusters to check their subnet group.',
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'DeleteCacheClusterCommand',
        reason: 'Deletes non-compliant ElastiCache clusters.',
      },
      {
        name: 'CreateCacheClusterCommand',
        reason: 'Recreates ElastiCache clusters with the desired subnet group.',
      }
    ],
    adviseBeforeFixFunction: 'Ensure data backups are available before fixing as clusters will be deleted and recreated.',
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
      if (cluster.CacheSubnetGroupName !== 'default') {
        compliantResources.push(cluster.ARN!);
      } else {
        nonCompliantResources.push(cluster.ARN!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const subnetGroupName = requiredParametersForFix.find(
      (param) => param.name === 'subnet-group-name'
    )?.value;

    if (!subnetGroupName) {
      throw new Error("Required parameter 'subnet-group-name' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster:')[1];
      const cluster = await this.memoClient.send(
        new DescribeCacheClustersCommand({ CacheClusterId: clusterId })
      );
      const clusterDetails = cluster.CacheClusters?.[0];

      if (!clusterDetails) {
        continue;
      }

      // Delete the non-compliant cluster
      await this.client.send(
        new DeleteCacheClusterCommand({
          CacheClusterId: clusterId,
        })
      );

      // Recreate the cluster with the desired subnet group
      await this.client.send(
        new CreateCacheClusterCommand({
          CacheClusterId: clusterDetails.CacheClusterId!,
          Engine: clusterDetails.Engine!,
          CacheNodeType: clusterDetails.CacheNodeType!,
          NumCacheNodes: clusterDetails.NumCacheNodes!,
          CacheSubnetGroupName: subnetGroupName,
          SecurityGroupIds: clusterDetails.SecurityGroups?.map(
            (group) => group.SecurityGroupId
          ) as string[],
          PreferredMaintenanceWindow: clusterDetails.PreferredMaintenanceWindow,
          EngineVersion: clusterDetails.EngineVersion,
        })
      );
    }
  };
}
