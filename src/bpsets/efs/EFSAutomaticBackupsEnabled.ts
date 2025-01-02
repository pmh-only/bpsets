import {
  EFSClient,
  DescribeFileSystemsCommand,
  PutBackupPolicyCommand,
  DescribeBackupPolicyCommand,
} from '@aws-sdk/client-efs';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class EFSAutomaticBackupsEnabled implements BPSet {
  private readonly client = new EFSClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getFileSystems = async () => {
    const response = await this.memoClient.send(new DescribeFileSystemsCommand({}));
    return response.FileSystems || [];
  };

  public readonly getMetadata = () => ({
    name: 'EFSAutomaticBackupsEnabled',
    description: 'Ensures that EFS file systems have automatic backups enabled.',
    priority: 1,
    priorityReason:
      'Enabling automatic backups helps protect against data loss and supports recovery from unintended modifications or deletions.',
    awsService: 'EFS',
    awsServiceCategory: 'File System',
    bestPracticeCategory: 'Backup and Recovery',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeFileSystemsCommand',
        reason: 'Retrieve the list of EFS file systems.',
      },
      {
        name: 'DescribeBackupPolicyCommand',
        reason: 'Check if a backup policy is enabled for the file system.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutBackupPolicyCommand',
        reason: 'Enable automatic backups for the file system.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure that enabling backups aligns with the organization’s cost and recovery objectives.',
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
    const fileSystems = await this.getFileSystems();

    for (const fileSystem of fileSystems) {
      const response = await this.client.send(
        new DescribeBackupPolicyCommand({ FileSystemId: fileSystem.FileSystemId! })
      );

      if (response.BackupPolicy?.Status === 'ENABLED') {
        compliantResources.push(fileSystem.FileSystemArn!);
      } else {
        nonCompliantResources.push(fileSystem.FileSystemArn!);
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

  public readonly fixImpl: BPSetFixFn = async (
    nonCompliantResources,
    requiredParametersForFix
  ) => {
    for (const arn of nonCompliantResources) {
      const fileSystemId = arn.split('/').pop()!;

      await this.client.send(
        new PutBackupPolicyCommand({
          FileSystemId: fileSystemId,
          BackupPolicy: { Status: 'ENABLED' },
        })
      );
    }
  };
}
