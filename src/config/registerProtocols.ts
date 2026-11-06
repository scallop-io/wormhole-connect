import { register as registerCctpExecutor } from '@wormhole-labs/cctp-executor-route';
import { register as registerBaseBridgeExecutor } from '@wormhole-labs/base-bridge-executor-route';

// These packages no longer register their platform protocols on import.
// Both calls are idempotent.
registerCctpExecutor();
registerBaseBridgeExecutor();
