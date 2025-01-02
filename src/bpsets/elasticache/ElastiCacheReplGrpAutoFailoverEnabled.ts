import {
  ElastiCacheClient,
  DescribeReplicationGroupsCommand,
  ModifyReplicationGroupCommand,
} from '@aws-sdk/client-elasticache';
import { BPSet, BPSetStats, BPSetFixFn } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ElastiCacheReplGrpAutoFailoverEnabled implements BPSet {
  private readonly client = new ElastiCacheClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getReplicationGroups = async () => {
    const response = await this.memoClient.send(new DescribeReplicationGroupsCommand({}));
    return response.ReplicationGroups || [];
  };

  public readonly getMetadata = () => ({
    name: 'ElastiCacheReplGrpAutoFailoverEnabled',
    description: 'Ensures that automatic failover is enabled for ElastiCache replication groups.',
    priority: 1,
    priorityReason: 'Automatic failover is critical for high availability and reliability of ElastiCache clusters.',
    awsService: 'ElastiCache',
    awsServiceCategory: 'Cache Service',
    bestPracticeCategory: 'Availability',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeReplicationGroupsCommand',
        reason: 'Fetches replication group details to verify automatic failover settings.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyReplicationGroupCommand',
        reason: 'Enables automatic failover for replication groups.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure the environment supports multi-AZ configurations before enabling automatic failover.',
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
    const replicationGroups = await this.getReplicationGroups();

    for (const group of replicationGroups) {
      if (group.AutomaticFailover === 'enabled') {
        compliantResources.push(group.ARN!);
      } else {
        nonCompliantResources.push(group.ARN!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const groupId = arn.split(':replication-group:')[1];
      await this.client.send(
        new ModifyReplicationGroupCommand({
          ReplicationGroupId: groupId,
          AutomaticFailoverEnabled: true,
        })
      );
    }
  };
}
