import {
  LambdaClient,
  ListFunctionsCommand,
  UpdateFunctionConfigurationCommand
} from '@aws-sdk/client-lambda';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class LambdaInsideVPC implements BPSet {
  private readonly client = new LambdaClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'LambdaInsideVPC',
    description: 'Ensures Lambda functions are configured to run inside a VPC.',
    priority: 2,
    priorityReason: 'Running Lambda inside a VPC enhances security by restricting access.',
    awsService: 'Lambda',
    awsServiceCategory: 'Serverless',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'subnet-ids',
        description: 'Comma-separated list of VPC subnet IDs.',
        default: '',
        example: 'subnet-abc123,subnet-def456',
      },
      {
        name: 'security-group-ids',
        description: 'Comma-separated list of VPC security group IDs.',
        default: '',
        example: 'sg-abc123,sg-def456',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListFunctionsCommand',
        reason: 'Retrieve all Lambda functions in the account.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateFunctionConfigurationCommand',
        reason: 'Update the VPC configuration for non-compliant Lambda functions.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure the provided subnet and security group IDs are correct and appropriate for the Lambda function\'s requirements.',
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
    const functions = await this.getFunctions();

    for (const func of functions) {
      if (func.VpcConfig && Object.keys(func.VpcConfig).length > 0) {
        compliantResources.push(func.FunctionArn!);
      } else {
        nonCompliantResources.push(func.FunctionArn!);
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
    const subnetIds = requiredParametersForFix.find(param => param.name === 'subnet-ids')?.value;
    const securityGroupIds = requiredParametersForFix.find(param => param.name === 'security-group-ids')?.value;

    if (!subnetIds || !securityGroupIds) {
      throw new Error("Required parameters 'subnet-ids' and/or 'security-group-ids' are missing.");
    }

    for (const functionArn of nonCompliantResources) {
      const functionName = functionArn.split(':').pop()!;
      await this.client.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          VpcConfig: {
            SubnetIds: subnetIds.split(','),
            SecurityGroupIds: securityGroupIds.split(',')
          }
        })
      );
    }
  };

  private readonly getFunctions = async () => {
    const response = await this.memoClient.send(new ListFunctionsCommand({}));
    return response.Functions || [];
  };
}
