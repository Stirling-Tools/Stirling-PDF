import { Command } from './command.js';

/**
 * Composes multiple commands into a single atomic operation.
 * Executes in order; undo in reverse order.
 */
export class CommandSequence extends Command {
  /** @param {Command[]} commands - Commands to be executed/undone/redone as a group. */
  constructor(commands) {
    super();
    this.commands = commands;
  }

  /** Execute: run each command in order. */
  execute() {
    this.commands.forEach((command) => command.execute());
  }

  /** Undo: undo in reverse order. */
  undo() {
    this.commands.slice().reverse().forEach((command) => command.undo());
  }

  /** Redo: simply execute again. */
  redo() {
    this.execute();
  }
}
