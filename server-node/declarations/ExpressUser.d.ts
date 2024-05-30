type UserModel = import("../src/auth/user/user-model").User;

declare namespace Express {
    interface User extends UserModel {
        
    }
}