import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds';
import {
  BackupClient,
  ListRecoveryPointsByResourceCommand
} from '@aws-sdk/client-backup';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class AuroraLastBackupRecoveryPointCreated implements BPSet {
  private readonly rdsClient = new RDSClient({});
  private readonly backupClient = new BackupClient({});
  private readonly memoRdsClient = Memorizer.memo(this.rdsClient);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'AuroraLastBackupRecoveryPointCreated',
    description: 'Ensures that Aurora DB clusters have a recovery point created within the last 24 hours.',
    priority: 1,
    priorityReason: 'Ensuring regular backups protects against data loss.',
    awsService: 'RDS',
    awsServiceCategory: 'Aurora',
    bestPracticeCategory: 'Backup',
    requiredParametersForFix: [
      {
        name: 'backup-retention-period',
        description: 'The number of days to retain backups for the DB cluster.',
        default: '7',
        example: '7',
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClustersCommand',
        reason: 'Retrieve information about Aurora DB clusters.',
      },
      {
        name: 'ListRecoveryPointsByResourceCommand',
        reason: 'Check the recovery points associated with the DB cluster.',
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBClusterCommand',
        reason: 'Update the backup retention period for the DB cluster.',
      }
    ],
    adviseBeforeFixFunction: 'Ensure that extending the backup retention period aligns with your data protection policies.',
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
      const recoveryPoints = await this.getRecoveryPoints(cluster.DBClusterArn!);
      const recoveryDates = recoveryPoints.map(rp => new Date(rp.CreationDate!));
      recoveryDates.sort((a, b) => b.getTime() - a.getTime());

      if (
        recoveryDates.length > 0 &&
        new Date().getTime() - recoveryDates[0].getTime() < 24 * 60 * 60 * 1000
      ) {
        compliantResources.push(cluster.DBClusterArn!);
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
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

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const retentionPeriod = requiredParametersForFix.find(
      param => param.name === 'backup-retention-period'
    )?.value;

    if (!retentionPeriod) {
      throw new Error("Required parameter 'backup-retention-period' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster/')[1];

      await this.rdsClient.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          BackupRetentionPeriod: parseInt(retentionPeriod, 10)
        })
      );
    }
  };

  private readonly getDBClusters = async () => {
    const response = await this.memoRdsClient.send(new DescribeDBClustersCommand({}));
    return response.DBClusters || [];
  };

  private readonly getRecoveryPoints = async (resourceArn: string) => {
    const response = await this.backupClient.send(
      new ListRecoveryPointsByResourceCommand({ ResourceArn: resourceArn })
    );
    return response.RecoveryPoints || [];
  };
}
