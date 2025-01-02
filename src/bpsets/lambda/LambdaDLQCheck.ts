import { LambdaClient, ListFunctionsCommand, UpdateFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class LambdaDLQCheck implements BPSet {
  private readonly client = new LambdaClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'LambdaDLQCheck',
    description: 'Ensures that Lambda functions have a configured Dead Letter Queue (DLQ).',
    priority: 2,
    priorityReason: 'A DLQ is critical for handling failed events in Lambda, enhancing reliability.',
    awsService: 'Lambda',
    awsServiceCategory: 'Serverless',
    bestPracticeCategory: 'Reliability',
    requiredParametersForFix: [
      {
        name: 'dlq-arn',
        description: 'The ARN of the Dead Letter Queue to associate with the Lambda function.',
        default: '',
        example: 'arn:aws:sqs:us-east-1:123456789012:example-queue',
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
        reason: 'Update the DLQ configuration for Lambda functions.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure that the specified DLQ exists and is correctly configured to handle failed events.',
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
      .then(
        () => {
          this.stats.status = 'FINISHED';
        },
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
    const functions = await this.getFunctions();

    for (const func of functions) {
      if (func.DeadLetterConfig) {
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
      .then(
        () => {
          this.stats.status = 'FINISHED';
        },
        (err) => {
          this.stats.status = 'ERROR';
          this.stats.errorMessage.push({
            date: new Date(),
            message: err.message,
          });
        }
      );
  };

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const dlqArn = requiredParametersForFix.find((param) => param.name === 'dlq-arn')?.value;

    if (!dlqArn) {
      throw new Error("Required parameter 'dlq-arn' is missing.");
    }

    for (const functionArn of nonCompliantResources) {
      const functionName = functionArn.split(':').pop()!;
      await this.client.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          DeadLetterConfig: { TargetArn: dlqArn },
        })
      );
    }
  };

  private readonly getFunctions = async () => {
    const response = await this.memoClient.send(new ListFunctionsCommand({}));
    return response.Functions || [];
  };
}
