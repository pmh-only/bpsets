import {
  S3Client,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import { BackupClient, ListRecoveryPointsByResourceCommand } from '@aws-sdk/client-backup';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class S3LastBackupRecoveryPointCreated implements BPSet {
  private readonly client = new S3Client({});
  private readonly memoClient = Memorizer.memo(this.client);
  private readonly backupClient = Memorizer.memo(new BackupClient({}));

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3LastBackupRecoveryPointCreated',
    description: 'Ensures that S3 buckets have recent backup recovery points.',
    priority: 2,
    priorityReason: 'Backup recovery points are critical for disaster recovery and data resilience.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Backup & Recovery',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListRecoveryPointsByResourceCommand',
        reason: 'Checks for recent recovery points for the S3 bucket.',
      },
    ],
    commandUsedInFixFunction: [],
    adviseBeforeFixFunction: 'Ensure the backup plan for S3 buckets is appropriately configured before proceeding.',
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
    const buckets = await this.getBuckets();

    for (const bucket of buckets) {
      const recoveryPoints = await this.backupClient.send(
        new ListRecoveryPointsByResourceCommand({
          ResourceArn: `arn:aws:s3:::${bucket.Name!}`,
        })
      );

      if (
        recoveryPoints.RecoveryPoints &&
        recoveryPoints.RecoveryPoints.length > 0
      ) {
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
      } else {
        nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async () => {
    this.stats.status = 'ERROR';
    this.stats.errorMessage.push({
      date: new Date(),
      message: 'Fixing recovery points requires custom implementation for backup setup.',
    });
    throw new Error(
      'Fixing recovery points requires custom implementation for backup setup.'
    );
  };

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}));
    return response.Buckets || [];
  };
}
