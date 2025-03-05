import {Command} from './command.js';

export class CommandSequence extends Command {
  constructor(commands) {
    super();
    this.commands = commands;

  }
  execute() {
   this.commands.forEach((command) => command.execute())
  }

  undo() {
   this.commands.slice().reverse().forEach((command) => command.undo())
  }

  redo() {
    this.execute();
  }
}
