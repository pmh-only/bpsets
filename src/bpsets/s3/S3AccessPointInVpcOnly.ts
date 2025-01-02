import {
  S3ControlClient,
  ListAccessPointsCommand,
  DeleteAccessPointCommand,
  CreateAccessPointCommand
} from '@aws-sdk/client-s3-control';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class S3AccessPointInVpcOnly implements BPSet {
  private readonly client = new S3ControlClient({});
  private readonly memoClient = Memorizer.memo(this.client);
  private readonly stsClient = Memorizer.memo(new STSClient({}));

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3AccessPointInVpcOnly',
    description: 'Ensures that all S3 access points are restricted to a VPC.',
    priority: 1,
    priorityReason: 'Restricting access points to a VPC ensures enhanced security and control.',
    awsService: 'S3',
    awsServiceCategory: 'Access Points',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'your-vpc-id',
        description: 'The VPC ID to associate with the access points.',
        default: '',
        example: 'vpc-1234567890abcdef'
      }
    ],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'ListAccessPointsCommand',
        reason: 'Lists all S3 access points in the account.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'DeleteAccessPointCommand',
        reason: 'Deletes access points that are not restricted to a VPC.'
      },
      {
        name: 'CreateAccessPointCommand',
        reason: 'Recreates access points with a VPC configuration.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that the specified VPC ID is correct and accessible.'
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
          message: err.message
        });
      });
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const accountId = await this.getAccountId();

    const response = await this.memoClient.send(
      new ListAccessPointsCommand({ AccountId: accountId })
    );

    for (const accessPoint of response.AccessPointList || []) {
      if (accessPoint.NetworkOrigin === 'VPC') {
        compliantResources.push(accessPoint.AccessPointArn!);
      } else {
        nonCompliantResources.push(accessPoint.AccessPointArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING';

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        });
      });
  };

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const accountId = await this.getAccountId();
    const vpcId = requiredParametersForFix.find(param => param.name === 'your-vpc-id')?.value;

    if (!vpcId) {
      throw new Error("Required parameter 'your-vpc-id' is missing.");
    }

    for (const accessPointArn of nonCompliantResources) {
      const accessPointName = accessPointArn.split(':').pop()!;
      const bucketName = accessPointArn.split('/')[1]!;

      await this.client.send(
        new DeleteAccessPointCommand({
          AccountId: accountId,
          Name: accessPointName
        })
      );

      await this.client.send(
        new CreateAccessPointCommand({
          AccountId: accountId,
          Name: accessPointName,
          Bucket: bucketName,
          VpcConfiguration: {
            VpcId: vpcId
          }
        })
      );
    }
  };

  private readonly getAccountId = async (): Promise<string> => {
    const response = await this.stsClient.send(new GetCallerIdentityCommand({}));
    return response.Account!;
  };
}
