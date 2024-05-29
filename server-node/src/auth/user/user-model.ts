import {
    Association, DataTypes, Model, ModelDefined, Optional,
    Sequelize, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute, ForeignKey,

    HasManyAddAssociationMixin, HasManyCountAssociationsMixin,
    HasManyCreateAssociationMixin, HasManyGetAssociationsMixin, HasManyHasAssociationMixin,
    HasManySetAssociationsMixin, HasManyAddAssociationsMixin, HasManyHasAssociationsMixin,
    HasManyRemoveAssociationMixin, HasManyRemoveAssociationsMixin, 

    HasOneGetAssociationMixin, HasOneSetAssociationMixin, HasOneCreateAssociationMixin,
} from 'sequelize';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
    declare id: CreationOptional<number>;
    declare username: string;
    declare mail?: string;
    declare authenticationMethod: string;

    declare getPassword: HasOneGetAssociationMixin<Password | undefined>; // Note the null assertions!
    declare setPassword: HasOneSetAssociationMixin<Password | undefined, number>;
    declare createPassword: HasOneCreateAssociationMixin<Password>;

    declare getAccessRules: HasManyGetAssociationsMixin<AccessRule | undefined>; // Note the null assertions!
    declare addAccessRule: HasManyAddAssociationMixin<AccessRule | undefined, number>;
    declare addAccessRules: HasManyAddAssociationsMixin<AccessRule | undefined, number>;
    declare setAccessRules: HasManySetAssociationsMixin<AccessRule | undefined, number>;
    declare removeAccessRule: HasManyRemoveAssociationMixin<AccessRule | undefined, number>;
    declare removeAccessRules: HasManyRemoveAssociationsMixin<AccessRule | undefined, number>;
    declare hasAccessRule: HasManyHasAssociationMixin<AccessRule | undefined, number>;
    declare hasAccessRules: HasManyHasAssociationsMixin<AccessRule | undefined, number>;
    declare countAccessRules: HasManyCountAssociationsMixin;
    declare createAccessRule: HasManyCreateAssociationMixin<AccessRule, 'userId'>;

    declare getAPIKeys: HasManyGetAssociationsMixin<APIKey | undefined>; // Note the null assertions!
    declare addAPIKey: HasManyAddAssociationMixin<APIKey | undefined, number>;
    declare addAPIKeys: HasManyAddAssociationsMixin<APIKey | undefined, number>;
    declare setAPIKeys: HasManySetAssociationsMixin<APIKey | undefined, number>;
    declare removeAPIKey: HasManyRemoveAssociationMixin<APIKey | undefined, number>;
    declare removeAPIKeys: HasManyRemoveAssociationsMixin<APIKey | undefined, number>;
    declare hasAPIKey: HasManyHasAssociationMixin<APIKey | undefined, number>;
    declare hasAPIKeys: HasManyHasAssociationsMixin<APIKey | undefined, number>;
    declare countAPIKeys: HasManyCountAssociationsMixin;
    declare createAPIKey: HasManyCreateAssociationMixin<APIKey, 'userId'>;

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

export class Password extends Model<InferAttributes<Password>, InferCreationAttributes<Password>> {
    declare id: CreationOptional<number>;
    declare password: string;

    declare ownerId: ForeignKey<User['id']>;
    declare owner?: NonAttribute<User>;
    
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

export class AccessRule extends Model<InferAttributes<AccessRule>, InferCreationAttributes<AccessRule>> {
    declare id: CreationOptional<number>;
    declare grants: string;

    declare userId: ForeignKey<User['id']>;
    declare user?: NonAttribute<User>;
    
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

export class APIKey extends Model<InferAttributes<APIKey>, InferCreationAttributes<APIKey>> {
    declare id: CreationOptional<number>;
    declare apikey: string;

    declare userId: ForeignKey<User['id']>;
    declare user?: NonAttribute<User>;
    
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}