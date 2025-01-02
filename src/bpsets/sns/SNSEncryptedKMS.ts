import {
  SNSClient,
  ListTopicsCommand,
  GetTopicAttributesCommand,
  SetTopicAttributesCommand,
} from '@aws-sdk/client-sns';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class SNSEncryptedKMS implements BPSet {
  private readonly client = new SNSClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'SNSEncryptedKMS',
    description: 'Ensures that all SNS topics are encrypted with a KMS key.',
    priority: 2,
    priorityReason: 'Encryption protects sensitive data in transit and at rest.',
    awsService: 'SNS',
    awsServiceCategory: 'Messaging',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'kms-key-id',
        description: 'The ARN or ID of the KMS key to use for encryption.',
        default: '',
        example: 'arn:aws:kms:us-east-1:123456789012:key/abcd-1234-efgh-5678',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTopicsCommand',
        reason: 'Lists all SNS topics in the account.',
      },
      {
        name: 'GetTopicAttributesCommand',
        reason: 'Retrieves attributes for each SNS topic.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'SetTopicAttributesCommand',
        reason: 'Sets the KMS key for encryption on the SNS topic.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure that the specified KMS key has the necessary permissions to encrypt SNS topics.',
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
    const topics = await this.getTopics();

    for (const topic of topics) {
      if ((topic as any).KmsMasterKeyId) {
        compliantResources.push(topic.TopicArn!);
      } else {
        nonCompliantResources.push(topic.TopicArn!);
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
          message: err.message,
        });
      });
  };

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const kmsKeyId = requiredParametersForFix.find((param) => param.name === 'kms-key-id')?.value;

    if (!kmsKeyId) {
      throw new Error("Required parameter 'kms-key-id' is missing.");
    }

    for (const arn of nonCompliantResources) {
      await this.client.send(
        new SetTopicAttributesCommand({
          TopicArn: arn,
          AttributeName: 'KmsMasterKeyId',
          AttributeValue: kmsKeyId,
        })
      );
    }
  };

  private readonly getTopics = async () => {
    const topicsResponse = await this.memoClient.send(new ListTopicsCommand({}));
    const topics = topicsResponse.Topics || [];

    const topicDetails = [];
    for (const topic of topics) {
      const attributes = await this.memoClient.send(
        new GetTopicAttributesCommand({ TopicArn: topic.TopicArn! })
      );
      topicDetails.push({ ...attributes.Attributes, TopicArn: topic.TopicArn! });
    }

    return topicDetails;
  };
}
