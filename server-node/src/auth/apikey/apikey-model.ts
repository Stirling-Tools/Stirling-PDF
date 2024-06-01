import { User } from '../user/user-model';
import {
    Model, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute, ForeignKey,
} from 'sequelize';

export class APIKey extends Model<InferAttributes<APIKey>, InferCreationAttributes<APIKey>> {
    declare id: CreationOptional<number>;
    declare apikey: string;

    declare ownerId: ForeignKey<User['id']>;
    declare owner?: NonAttribute<User>;
    
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}