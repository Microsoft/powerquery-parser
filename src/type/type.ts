// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export type TType = IPrimitiveType | TExtendedType;
export type TExtendedType = AnyUnion | DefinedFunction | DefinedList | DefinedRecord | DefinedTable | DefinedType;
export type TExtendedTypeKind =
    | TypeKind.Any
    | TypeKind.Function
    | TypeKind.List
    | TypeKind.Record
    | TypeKind.Table
    | TypeKind.Type;

export type Action = IPrimitiveType<TypeKind.Action>;
export type Any = IPrimitiveType<TypeKind.Any>;
export type AnyNonNull = IPrimitiveType<TypeKind.AnyNonNull>;
export type Binary = IPrimitiveType<TypeKind.Binary>;
export type Date = IPrimitiveType<TypeKind.Date>;
export type DateTime = IPrimitiveType<TypeKind.DateTime>;
export type DateTimeZone = IPrimitiveType<TypeKind.DateTimeZone>;
export type Duration = IPrimitiveType<TypeKind.Duration>;
export type Function = IPrimitiveType<TypeKind.Function>;
export type List = IPrimitiveType<TypeKind.List>;
export type Logical = IPrimitiveType<TypeKind.Logical>;
export type None = IPrimitiveType<TypeKind.None>;
export type Null = IPrimitiveType<TypeKind.Null>;
export type Number = IPrimitiveType<TypeKind.Number>;
export type Record = IPrimitiveType<TypeKind.Record>;
export type Table = IPrimitiveType<TypeKind.Table>;
export type Text = IPrimitiveType<TypeKind.Text>;
export type Time = IPrimitiveType<TypeKind.Time>;
export type Type = IPrimitiveType<TypeKind.Type>;
export type Unknown = IPrimitiveType<TypeKind.Unknown>;

export const enum TypeKind {
    Action = "Action",
    Any = "Any",
    AnyNonNull = "AnyNonNull",
    Binary = "Binary",
    Date = "Date",
    DateTime = "DateTime",
    DateTimeZone = "DateTimeZone",
    Duration = "Duration",
    Function = "Function",
    List = "List",
    Logical = "Logical",
    None = "None",
    Null = "Null",
    Number = "Number",
    Record = "Record",
    Table = "Table",
    Text = "Text",
    Time = "Time",
    Type = "Type",
    Unknown = "Unknown",
}

export const enum ExtendedTypeKind {
    AnyUnion = "AnyUnion",
    DefinedFunction = "DefinedFunction",
    DefinedList = "DefinedList",
    DefinedRecord = "DefinedRecord",
    DefinedTable = "DefinedTable",
    DefinedType = "DefinedType",
}

export interface IType<T extends TypeKind = TypeKind> {
    readonly kind: T;
    readonly maybeExtendedKind: ExtendedTypeKind | undefined;
    readonly isNullable: boolean;
}

export interface IPrimitiveType<T extends TypeKind = TypeKind> extends IType<T> {
    readonly maybeExtendedKind: undefined;
}

export interface IExtendedType extends IType {
    readonly kind: TExtendedTypeKind;
    readonly maybeExtendedKind: ExtendedTypeKind;
}

export interface AnyUnion extends IExtendedType {
    readonly kind: TypeKind.Any;
    readonly maybeExtendedKind: ExtendedTypeKind.AnyUnion;
    readonly unionedTypePairs: ReadonlyArray<TType>;
}

export interface DefinedFunction extends IExtendedType {
    readonly kind: TypeKind.Function;
    readonly maybeExtendedKind: ExtendedTypeKind.DefinedFunction;
    readonly parameterTypes: ReadonlyArray<TType>;
    readonly returnType: TType;
}

export interface DefinedList extends IExtendedType {
    readonly kind: TypeKind.List;
    readonly maybeExtendedKind: ExtendedTypeKind.DefinedList;
    readonly elements: ReadonlyArray<TType>;
}

export interface DefinedRecord extends IExtendedType {
    readonly kind: TypeKind.Record;
    readonly maybeExtendedKind: ExtendedTypeKind.DefinedRecord;
    readonly fields: Map<string, TType>;
    readonly isOpen: boolean;
}

export interface DefinedTable extends IExtendedType {
    readonly kind: TypeKind.Table;
    readonly maybeExtendedKind: ExtendedTypeKind.DefinedTable;
    readonly fields: Map<string, TType>;
    readonly isOpen: boolean;
}

export interface DefinedType extends IExtendedType {
    readonly kind: TypeKind.Type;
    readonly maybeExtendedKind: ExtendedTypeKind.DefinedType;
    readonly primaryType: TType;
}

export interface SimplifiedNullablePrimitiveType {
    readonly typeKind: TypeKind;
    readonly isNullable: boolean;
}
