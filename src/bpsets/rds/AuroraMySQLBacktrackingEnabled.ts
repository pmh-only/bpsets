import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class AuroraMySQLBacktrackingEnabled implements BPSet {
  private readonly client = new RDSClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'AuroraMySQLBacktrackingEnabled',
    description: 'Ensures that backtracking is enabled for Aurora MySQL clusters.',
    priority: 1,
    priorityReason: 'Enabling backtracking provides point-in-time recovery for Aurora MySQL databases.',
    awsService: 'RDS',
    awsServiceCategory: 'Aurora',
    bestPracticeCategory: 'Data Protection',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClustersCommand',
        reason: 'Fetch Aurora MySQL DB clusters and check backtracking configuration.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBClusterCommand',
        reason: 'Enable backtracking for non-compliant Aurora MySQL DB clusters.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure that enabling backtracking aligns with your application requirements.',
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
          message: err.message,
        });
      });
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const dbClusters = await this.getDBClusters();

    for (const cluster of dbClusters) {
      if (
        cluster.Engine === 'aurora-mysql' &&
        (!cluster.EarliestBacktrackTime || cluster.EarliestBacktrackTime === null)
      ) {
        nonCompliantResources.push(cluster.DBClusterArn!);
      } else {
        compliantResources.push(cluster.DBClusterArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    await this.fixImpl(nonCompliantResources)
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      });
  };

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster/')[1];
      await this.client.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          BacktrackWindow: 3600, // Set backtracking window to 1 hour
        })
      );
    }
  };

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}));
    return response.DBClusters || [];
  };
}
