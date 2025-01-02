import {
  ElastiCacheClient,
  DescribeReplicationGroupsCommand,
  ModifyReplicationGroupCommand,
} from '@aws-sdk/client-elasticache';
import { BPSet, BPSetStats, BPSetFixFn } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ElastiCacheRedisClusterAutomaticBackupCheck implements BPSet {
  private readonly client = new ElastiCacheClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getReplicationGroups = async () => {
    const response = await this.memoClient.send(new DescribeReplicationGroupsCommand({}));
    return response.ReplicationGroups || [];
  };

  public readonly getMetadata = () => ({
    name: 'ElastiCacheRedisClusterAutomaticBackupCheck',
    description: 'Ensures that Redis clusters in ElastiCache have automatic backups enabled.',
    priority: 2,
    priorityReason: 'Automatic backups are crucial for disaster recovery and data safety.',
    awsService: 'ElastiCache',
    awsServiceCategory: 'Cache Service',
    bestPracticeCategory: 'Reliability',
    requiredParametersForFix: [
      {
        name: 'snapshot-retention-period',
        description: 'Number of days to retain automatic snapshots.',
        default: '7',
        example: '7',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeReplicationGroupsCommand',
        reason: 'Fetches details of replication groups to verify backup settings.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyReplicationGroupCommand',
        reason: 'Enables automatic snapshots and sets the retention period for Redis clusters.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure that enabling snapshots does not conflict with operational or compliance requirements.',
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
      if (group.SnapshottingClusterId) {
        compliantResources.push(group.ARN!);
      } else {
        nonCompliantResources.push(group.ARN!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const retentionPeriod = requiredParametersForFix.find(
      (param) => param.name === 'snapshot-retention-period'
    )?.value;

    if (!retentionPeriod) {
      throw new Error("Required parameter 'snapshot-retention-period' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const groupId = arn.split(':replication-group:')[1];
      await this.client.send(
        new ModifyReplicationGroupCommand({
          ReplicationGroupId: groupId,
          SnapshotRetentionLimit: parseInt(retentionPeriod, 10),
        })
      );
    }
  };
}
