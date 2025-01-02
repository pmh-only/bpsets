import {
  ElastiCacheClient,
  DescribeReplicationGroupsCommand,
} from '@aws-sdk/client-elasticache';
import { BPSet, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ElastiCacheReplGrpEncryptedAtRest implements BPSet {
  private readonly client = new ElastiCacheClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getReplicationGroups = async () => {
    const response = await this.memoClient.send(new DescribeReplicationGroupsCommand({}));
    return response.ReplicationGroups || [];
  };

  public readonly getMetadata = () => ({
    name: 'ElastiCacheReplGrpEncryptedAtRest',
    description: 'Ensures that ElastiCache replication groups are encrypted at rest.',
    priority: 1,
    priorityReason: 'Encryption at rest is crucial for protecting data in compliance with security standards.',
    awsService: 'ElastiCache',
    awsServiceCategory: 'Cache Service',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeReplicationGroupsCommand',
        reason: 'Fetches replication group details to verify encryption settings.',
      },
    ],
    commandUsedInFixFunction: [],
    adviseBeforeFixFunction: 'Recreation of the replication group is required for encryption. Ensure data backups are available.',
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
      if (group.AtRestEncryptionEnabled) {
        compliantResources.push(group.ARN!);
      } else {
        nonCompliantResources.push(group.ARN!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async () => {
    throw new Error(
      'Fixing encryption at rest for replication groups requires recreation. Please create a new replication group with AtRestEncryptionEnabled set to true.'
    );
  };
}
