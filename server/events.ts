import { EventEmitter } from 'node:events';
import type { ServerEvent } from '../src/data/types';

/** In-process pub/sub used to push updates to browsers over SSE. */
export class EventBus {
  private ee = new EventEmitter();
  constructor() {
    this.ee.setMaxListeners(200);
  }
  emit(e: ServerEvent) {
    this.ee.emit('event', e);
  }
  on(fn: (e: ServerEvent) => void): () => void {
    this.ee.on('event', fn);
    return () => this.ee.off('event', fn);
  }
}
