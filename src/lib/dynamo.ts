import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Created once per execution environment and reused across invocations, so warm
 * Lambdas skip client construction and keep their HTTP connections alive.
 */
let documentClient: DynamoDBDocumentClient | undefined;

export function getDocumentClient(): DynamoDBDocumentClient {
  if (!documentClient) {
    documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: {
        // Dynamo rejects undefined; dropping them keeps optional synth
        // parameters (envelope, filter, filterEnvelope) from breaking writes.
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });
  }
  return documentClient;
}

/** Test seam: lets suites inject a mocked client without touching AWS. */
export function setDocumentClient(client: DynamoDBDocumentClient | undefined): void {
  documentClient = client;
}
