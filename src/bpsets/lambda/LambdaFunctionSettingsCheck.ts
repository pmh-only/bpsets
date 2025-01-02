import { 
  LambdaClient, 
  ListFunctionsCommand, 
  UpdateFunctionConfigurationCommand 
} from '@aws-sdk/client-lambda';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class LambdaFunctionSettingsCheck implements BPSet {
  private readonly client = new LambdaClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'LambdaFunctionSettingsCheck',
    description: 'Ensures Lambda functions have non-default timeout and memory size configurations.',
    priority: 2,
    priorityReason: 'Default configurations may not be suitable for production workloads.',
    awsService: 'Lambda',
    awsServiceCategory: 'Serverless',
    bestPracticeCategory: 'Configuration',
    requiredParametersForFix: [
      {
        name: 'timeout',
        description: 'Timeout value in seconds for the Lambda function.',
        default: '3',
        example: '30',
      },
      {
        name: 'memory-size',
        description: 'Memory size in MB for the Lambda function.',
        default: '128',
        example: '256',
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
        reason: 'Update the timeout and memory size settings for non-compliant Lambda functions.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure that the timeout and memory size changes are suitable for the function\'s requirements.',
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
    const defaultTimeout = 3;
    const defaultMemorySize = 128;

    const functions = await this.getFunctions();

    for (const func of functions) {
      if (func.Timeout === defaultTimeout || func.MemorySize === defaultMemorySize) {
        nonCompliantResources.push(func.FunctionArn!);
      } else {
        compliantResources.push(func.FunctionArn!);
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
    const timeout = requiredParametersForFix.find(param => param.name === 'timeout')?.value;
    const memorySize = requiredParametersForFix.find(param => param.name === 'memory-size')?.value;

    if (!timeout || !memorySize) {
      throw new Error("Required parameters 'timeout' and/or 'memory-size' are missing.");
    }

    for (const functionArn of nonCompliantResources) {
      const functionName = functionArn.split(':').pop()!;
      await this.client.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Timeout: parseInt(timeout, 10),
          MemorySize: parseInt(memorySize, 10),
        })
      );
    }
  };

  private readonly getFunctions = async () => {
    const response = await this.memoClient.send(new ListFunctionsCommand({}));
    return response.Functions || [];
  };
}
