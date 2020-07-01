// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Type } from ".";
import { ArrayUtils, Assert, CommonError, MapUtils } from "../common";
import { ParameterScopeItem } from "../inspection";
import { Ast, AstUtils } from "../language";
import { NodeIdMap, NodeIdMapUtils, ParseContext, TXorNode, XorNodeKind } from "../parser";

export function primitiveTypeFactory<T extends Type.TypeKind>(typeKind: T, isNullable: boolean): Type.IPrimitiveType {
    const key: string = primitiveTypeMapKey(typeKind, isNullable);
    const maybeValue: Type.IPrimitiveType | undefined = primitiveTypeConstantMap.get(key);
    if (maybeValue === undefined) {
        const details: {} = {
            typeKind,
            isNullable,
        };
        throw new CommonError.InvariantError(`unknown [typeKind, isNullable] key`, details);
    }

    return maybeValue;
}

export function anyUnionFactory(unionedTypePairs: ReadonlyArray<Type.TType>): Type.TType {
    const simplified: ReadonlyArray<Type.TType> = dedupe(unionedTypePairs);
    if (simplified.length === 1) {
        return simplified[0];
    }

    return {
        kind: Type.TypeKind.Any,
        maybeExtendedKind: Type.ExtendedTypeKind.AnyUnion,
        isNullable: unionedTypePairs.find((ttype: Type.TType) => ttype.isNullable === true) !== undefined,
        unionedTypePairs: simplified,
    };
}

export function definedRecordFactory(
    isNullable: boolean,
    fields: Map<string, Type.TType>,
    isOpen: boolean,
): Type.DefinedRecord {
    return {
        kind: Type.TypeKind.Record,
        maybeExtendedKind: Type.ExtendedTypeKind.DefinedRecord,
        isNullable,
        fields,
        isOpen,
    };
}

export function definedTableFactory(
    isNullable: boolean,
    fields: Map<string, Type.TType>,
    isOpen: boolean,
): Type.DefinedTable {
    return {
        kind: Type.TypeKind.Table,
        maybeExtendedKind: Type.ExtendedTypeKind.DefinedTable,
        isNullable,
        fields,
        isOpen,
    };
}

export function parameterFactory(parameter: ParameterScopeItem): Type.TType {
    if (parameter.maybeType === undefined) {
        return Type.NoneInstance;
    }

    return {
        kind: typeKindFromPrimitiveTypeConstantKind(parameter.maybeType),
        maybeExtendedKind: undefined,
        isNullable: parameter.isNullable,
    };
}

export function dedupe(types: ReadonlyArray<Type.TType>): ReadonlyArray<Type.TType> {
    const anyUnionTypes: Type.AnyUnion[] = [];
    const partial: Type.TType[] = [];

    for (const item of types) {
        if (item.maybeExtendedKind === Type.ExtendedTypeKind.AnyUnion) {
            if (typeNotInArray(anyUnionTypes, item)) {
                anyUnionTypes.push(item);
            }
        } else if (typeNotInArray(partial, item)) {
            partial.push(item);
        }
    }

    if (anyUnionTypes.length === 0) {
        return partial;
    }

    const dedupedAnyUnion: Type.TType = dedupeAnyUnions(anyUnionTypes);
    // Merge the return of dedupeAnyUnions into partial
    if (dedupedAnyUnion.maybeExtendedKind !== Type.ExtendedTypeKind.AnyUnion) {
        if (typeNotInArray(partial, dedupedAnyUnion)) {
            partial.push(dedupedAnyUnion);
        }

        return partial;
    }
    // Merge partial into the return of dedupeAnyUnions
    else {
        let isNullableEncountered: boolean = false;
        const typesNotInDedupedAnyUnion: Type.TType[] = [];

        for (const item of partial) {
            if (typeNotInArray(dedupedAnyUnion.unionedTypePairs, item)) {
                if (item.isNullable) {
                    isNullableEncountered = true;
                }
                typesNotInDedupedAnyUnion.push(item);
            }
        }

        return [
            {
                kind: Type.TypeKind.Any,
                maybeExtendedKind: Type.ExtendedTypeKind.AnyUnion,
                isNullable: isNullableEncountered,
                unionedTypePairs: [...dedupedAnyUnion.unionedTypePairs, ...typesNotInDedupedAnyUnion],
            },
        ];
    }
}

// Combines all given AnyUnions into either:
//  * a single AnyUnion
//  * a single Type.TType that is not an AnyUnion
// The first case is the most common.
// The second happens if several AnyUnion consist only of one unique type, then it should be simplified to that type.
export function dedupeAnyUnions(anyUnions: ReadonlyArray<Type.AnyUnion>): Type.TType {
    const simplified: Type.TType[] = [];
    let isNullable = false;

    for (const anyUnion of anyUnions) {
        for (const type of flattenUnionedTypePairs(anyUnion)) {
            if (type.isNullable === true) {
                isNullable = true;
            }
            if (typeNotInArray(simplified, type)) {
                simplified.push(type);
            }
        }
    }

    // Second case
    if (simplified.length === 1) {
        return simplified[0];
    }

    // First Case
    return {
        kind: Type.TypeKind.Any,
        maybeExtendedKind: Type.ExtendedTypeKind.AnyUnion,
        isNullable,
        unionedTypePairs: simplified,
    };
}

// Recursively flattens out all unionedTypePairs into an array.
export function flattenUnionedTypePairs(anyUnion: Type.AnyUnion): ReadonlyArray<Type.TType> {
    let newUnionedTypePairs: Type.TType[] = [];

    for (const item of anyUnion.unionedTypePairs) {
        if (item.maybeExtendedKind === Type.ExtendedTypeKind.AnyUnion) {
            newUnionedTypePairs = newUnionedTypePairs.concat(flattenUnionedTypePairs(item));
        } else {
            newUnionedTypePairs.push(item);
        }
    }

    return newUnionedTypePairs;
}

export function typeKindFromLiteralKind(literalKind: Ast.LiteralKind): Type.TypeKind {
    switch (literalKind) {
        case Ast.LiteralKind.List:
            return Type.TypeKind.List;

        case Ast.LiteralKind.Logical:
            return Type.TypeKind.Logical;

        case Ast.LiteralKind.Null:
            return Type.TypeKind.Null;

        case Ast.LiteralKind.Numeric:
            return Type.TypeKind.Number;

        case Ast.LiteralKind.Record:
            return Type.TypeKind.Record;

        case Ast.LiteralKind.Text:
            return Type.TypeKind.Text;

        default:
            throw Assert.isNever(literalKind);
    }
}

export function maybePrimitiveTypeConstantKindFromTypeKind(
    typeKind: Type.TypeKind,
): Ast.PrimitiveTypeConstantKind | undefined {
    switch (typeKind) {
        case Type.TypeKind.Action:
            return Ast.PrimitiveTypeConstantKind.Action;

        case Type.TypeKind.Any:
            return Ast.PrimitiveTypeConstantKind.Any;

        case Type.TypeKind.AnyNonNull:
            return Ast.PrimitiveTypeConstantKind.AnyNonNull;

        case Type.TypeKind.Binary:
            return Ast.PrimitiveTypeConstantKind.Binary;

        case Type.TypeKind.Date:
            return Ast.PrimitiveTypeConstantKind.Date;

        case Type.TypeKind.DateTime:
            return Ast.PrimitiveTypeConstantKind.DateTime;

        case Type.TypeKind.DateTimeZone:
            return Ast.PrimitiveTypeConstantKind.DateTimeZone;

        case Type.TypeKind.Duration:
            return Ast.PrimitiveTypeConstantKind.Duration;

        case Type.TypeKind.Function:
            return Ast.PrimitiveTypeConstantKind.Function;

        case Type.TypeKind.List:
            return Ast.PrimitiveTypeConstantKind.List;

        case Type.TypeKind.Logical:
            return Ast.PrimitiveTypeConstantKind.Logical;

        case Type.TypeKind.None:
            return Ast.PrimitiveTypeConstantKind.None;

        case Type.TypeKind.Null:
            return Ast.PrimitiveTypeConstantKind.Null;

        case Type.TypeKind.Number:
            return Ast.PrimitiveTypeConstantKind.Number;

        case Type.TypeKind.Record:
            return Ast.PrimitiveTypeConstantKind.Record;

        case Type.TypeKind.Table:
            return Ast.PrimitiveTypeConstantKind.Table;

        case Type.TypeKind.Text:
            return Ast.PrimitiveTypeConstantKind.Text;

        case Type.TypeKind.Time:
            return Ast.PrimitiveTypeConstantKind.Time;

        case Type.TypeKind.Type:
            return Ast.PrimitiveTypeConstantKind.Type;

        case Type.TypeKind.NotApplicable:
        case Type.TypeKind.Unknown:
            return undefined;

        default:
            throw Assert.isNever(typeKind);
    }
}

export function typeKindFromPrimitiveTypeConstantKind(
    primitiveTypeConstantKind: Ast.PrimitiveTypeConstantKind,
): Type.TypeKind {
    switch (primitiveTypeConstantKind) {
        case Ast.PrimitiveTypeConstantKind.Action:
            return Type.TypeKind.Action;

        case Ast.PrimitiveTypeConstantKind.Any:
            return Type.TypeKind.Any;

        case Ast.PrimitiveTypeConstantKind.AnyNonNull:
            return Type.TypeKind.AnyNonNull;

        case Ast.PrimitiveTypeConstantKind.Binary:
            return Type.TypeKind.Binary;

        case Ast.PrimitiveTypeConstantKind.Date:
            return Type.TypeKind.Date;

        case Ast.PrimitiveTypeConstantKind.DateTime:
            return Type.TypeKind.DateTime;

        case Ast.PrimitiveTypeConstantKind.DateTimeZone:
            return Type.TypeKind.DateTimeZone;

        case Ast.PrimitiveTypeConstantKind.Duration:
            return Type.TypeKind.Duration;

        case Ast.PrimitiveTypeConstantKind.Function:
            return Type.TypeKind.Function;

        case Ast.PrimitiveTypeConstantKind.List:
            return Type.TypeKind.List;

        case Ast.PrimitiveTypeConstantKind.Logical:
            return Type.TypeKind.Logical;

        case Ast.PrimitiveTypeConstantKind.None:
            return Type.TypeKind.None;

        case Ast.PrimitiveTypeConstantKind.Null:
            return Type.TypeKind.Null;

        case Ast.PrimitiveTypeConstantKind.Number:
            return Type.TypeKind.Number;

        case Ast.PrimitiveTypeConstantKind.Record:
            return Type.TypeKind.Record;

        case Ast.PrimitiveTypeConstantKind.Table:
            return Type.TypeKind.Table;

        case Ast.PrimitiveTypeConstantKind.Text:
            return Type.TypeKind.Text;

        case Ast.PrimitiveTypeConstantKind.Time:
            return Type.TypeKind.Time;

        case Ast.PrimitiveTypeConstantKind.Type:
            return Type.TypeKind.Type;

        default:
            throw Assert.isNever(primitiveTypeConstantKind);
    }
}

export function equalType(left: Type.TType, right: Type.TType): boolean {
    if (left === right) {
        return true;
    } else if (
        left.kind !== right.kind ||
        left.maybeExtendedKind !== right.maybeExtendedKind ||
        left.isNullable !== right.isNullable
    ) {
        return false;
    } else if (left.maybeExtendedKind !== undefined && right.maybeExtendedKind !== undefined) {
        return equalExtendedTypes(left, right);
    } else {
        return true;
    }
}

export function equalTypes(leftTypes: ReadonlyArray<Type.TType>, rightTypes: ReadonlyArray<Type.TType>): boolean {
    if (leftTypes === rightTypes) {
        return true;
    } else if (leftTypes.length !== rightTypes.length) {
        return false;
    }

    const numTypes: number = leftTypes.length;
    for (let index: number = 0; index < numTypes; index += 1) {
        if (equalType(leftTypes[index], rightTypes[index]) === false) {
            return false;
        }
    }

    return true;
}

export function equalExtendedTypes<T extends Type.TType>(left: Type.TExtendedType, right: Type.TExtendedType): boolean {
    if (left === right) {
        return true;
    } else if (left.maybeExtendedKind !== right.maybeExtendedKind) {
        return false;
    }

    switch (left.maybeExtendedKind) {
        case Type.ExtendedTypeKind.AnyUnion:
            return equalAnyUnion(left, right as Type.AnyUnion);

        case Type.ExtendedTypeKind.DefinedFunction:
            return equalDefinedFunction(left, right as Type.DefinedFunction);

        case Type.ExtendedTypeKind.DefinedList:
            return equalDefinedList(left, right as Type.DefinedList);

        case Type.ExtendedTypeKind.DefinedRecord:
            return equalDefinedRecord(left, right as Type.DefinedRecord);

        case Type.ExtendedTypeKind.DefinedTable:
            return equalDefinedTable(left, right as Type.DefinedTable);

        case Type.ExtendedTypeKind.DefinedType:
            return equalDefinedType(left, right as Type.DefinedType<T>);

        case Type.ExtendedTypeKind.ListType:
            return equalListType(left, right as Type.ListType);

        case Type.ExtendedTypeKind.PrimaryExpressionTable:
            return equalPrimaryExpressionTable(left, right as Type.PrimaryExpressionTable);

        default:
            throw Assert.isNever(left);
    }
}

export function equalAnyUnion(left: Type.AnyUnion, right: Type.AnyUnion): boolean {
    return (
        left === right ||
        (left.isNullable === right.isNullable && equalTypes(left.unionedTypePairs, right.unionedTypePairs))
    );
}

export function equalDefinedFunction(left: Type.DefinedFunction, right: Type.DefinedFunction): boolean {
    return (
        left === right ||
        (left.isNullable === right.isNullable &&
            equalType(left.returnType, right.returnType) &&
            equalDefinedFunctionParameters(left.parameters, right.parameters))
    );
}

export function equalDefinedFunctionParameters(
    left: ReadonlyArray<Type.FunctionParameter>,
    right: ReadonlyArray<Type.FunctionParameter>,
): boolean {
    if (left === right) {
        return true;
    } else if (left.length !== right.length) {
        return false;
    }

    const numParameters: number = left.length;
    for (let index: number = 0; index < numParameters; index += 1) {
        const nthLeft: Type.FunctionParameter = left[index];
        const nthRight: Type.FunctionParameter = right[index];
        if (
            nthLeft.isNullable !== nthRight.isNullable ||
            nthLeft.isOptional !== nthRight.isOptional ||
            nthLeft.maybeType !== nthRight.maybeType
        ) {
            return false;
        }
    }

    return true;
}

export function equalDefinedList(left: Type.DefinedList, right: Type.DefinedList): boolean {
    if (left === right) {
        return true;
    } else if (left.elements.length !== right.elements.length || left.isNullable !== right.isNullable) {
        return false;
    }

    const rightElements: ReadonlyArray<Type.TType> = right.elements;
    return ArrayUtils.all(
        left.elements.map((leftType: Type.TType, index: number) => equalType(leftType, rightElements[index])),
    );
}

export function equalDefinedRecord(left: Type.DefinedRecord, right: Type.DefinedRecord): boolean {
    return (
        left === right ||
        (left.isNullable === right.isNullable &&
            MapUtils.equalMaps<string, Type.TType>(left.fields, right.fields, equalType))
    );
}

export function equalDefinedTable(left: Type.DefinedTable, right: Type.DefinedTable): boolean {
    return (
        left === right ||
        (left.isNullable === right.isNullable &&
            MapUtils.equalMaps<string, Type.TType>(left.fields, right.fields, equalType))
    );
}

export function equalDefinedType<T extends Type.TType>(left: Type.DefinedType<T>, right: Type.DefinedType<T>): boolean {
    return left === right || (left.isNullable === right.isNullable && equalType(left.primaryType, right.primaryType));
}

export function equalListType(left: Type.ListType, right: Type.ListType): boolean {
    return left === right || (left.isNullable === right.isNullable && equalType(left.itemType, right.itemType));
}

export function equalPrimaryExpressionTable(
    left: Type.PrimaryExpressionTable,
    right: Type.PrimaryExpressionTable,
): boolean {
    return left === right || equalType(left.type, right.type);
}

export function inspectParameter(
    nodeIdMapCollection: NodeIdMap.Collection,
    parameter: TXorNode,
): Type.FunctionParameter | undefined {
    switch (parameter.kind) {
        case XorNodeKind.Ast:
            return inspectAstParameter(parameter.node as Ast.TParameter);

        case XorNodeKind.Context:
            return inspectContextParameter(nodeIdMapCollection, parameter.node);

        default:
            throw Assert.isNever(parameter);
    }
}

export const primitiveTypeConstantMap: ReadonlyMap<string, Type.IPrimitiveType> = new Map<string, Type.IPrimitiveType>([
    [primitiveTypeMapKey(Type.AnyInstance.kind, Type.AnyInstance.isNullable), Type.AnyInstance],
    [primitiveTypeMapKey(Type.AnyNonNullInstance.kind, Type.AnyNonNullInstance.isNullable), Type.AnyNonNullInstance],
    [primitiveTypeMapKey(Type.BinaryInstance.kind, Type.BinaryInstance.isNullable), Type.BinaryInstance],
    [primitiveTypeMapKey(Type.DateInstance.kind, Type.DateInstance.isNullable), Type.DateInstance],
    [primitiveTypeMapKey(Type.DateTimeInstance.kind, Type.DateTimeInstance.isNullable), Type.DateTimeInstance],
    [
        primitiveTypeMapKey(Type.DateTimeZoneInstance.kind, Type.DateTimeZoneInstance.isNullable),
        Type.DateTimeZoneInstance,
    ],
    [primitiveTypeMapKey(Type.DurationInstance.kind, Type.DurationInstance.isNullable), Type.DurationInstance],
    [primitiveTypeMapKey(Type.FunctionInstance.kind, Type.FunctionInstance.isNullable), Type.FunctionInstance],
    [primitiveTypeMapKey(Type.ListInstance.kind, Type.ListInstance.isNullable), Type.ListInstance],
    [primitiveTypeMapKey(Type.LogicalInstance.kind, Type.LogicalInstance.isNullable), Type.LogicalInstance],
    [primitiveTypeMapKey(Type.NoneInstance.kind, Type.NoneInstance.isNullable), Type.NoneInstance],
    [primitiveTypeMapKey(Type.NullInstance.kind, Type.NullInstance.isNullable), Type.NullInstance],
    [primitiveTypeMapKey(Type.NumberInstance.kind, Type.NumberInstance.isNullable), Type.NumberInstance],
    [primitiveTypeMapKey(Type.RecordInstance.kind, Type.RecordInstance.isNullable), Type.RecordInstance],
    [primitiveTypeMapKey(Type.TableInstance.kind, Type.TableInstance.isNullable), Type.TableInstance],
    [primitiveTypeMapKey(Type.TextInstance.kind, Type.TextInstance.isNullable), Type.TextInstance],
    [
        primitiveTypeMapKey(Type.TypePrimitiveInstance.kind, Type.TypePrimitiveInstance.isNullable),
        Type.TypePrimitiveInstance,
    ],
    [primitiveTypeMapKey(Type.ActionInstance.kind, Type.ActionInstance.isNullable), Type.ActionInstance],
    [primitiveTypeMapKey(Type.TimeInstance.kind, Type.TimeInstance.isNullable), Type.TimeInstance],
    [
        primitiveTypeMapKey(Type.NotApplicableInstance.kind, Type.NotApplicableInstance.isNullable),
        Type.NotApplicableInstance,
    ],
    [primitiveTypeMapKey(Type.UnknownInstance.kind, Type.UnknownInstance.isNullable), Type.UnknownInstance],
    [primitiveTypeMapKey(Type.NullableAnyInstance.kind, Type.NullableAnyInstance.isNullable), Type.NullableAnyInstance],
    [
        primitiveTypeMapKey(Type.NullableBinaryInstance.kind, Type.NullableBinaryInstance.isNullable),
        Type.NullableBinaryInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableDateInstance.kind, Type.NullableDateInstance.isNullable),
        Type.NullableDateInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableDateTimeInstance.kind, Type.NullableDateTimeInstance.isNullable),
        Type.NullableDateTimeInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableDateTimeZoneInstance.kind, Type.NullableDateTimeZoneInstance.isNullable),
        Type.NullableDateTimeZoneInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableDurationInstance.kind, Type.NullableDurationInstance.isNullable),
        Type.NullableDurationInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableFunctionInstance.kind, Type.NullableFunctionInstance.isNullable),
        Type.NullableFunctionInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableListInstance.kind, Type.NullableListInstance.isNullable),
        Type.NullableListInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableLogicalInstance.kind, Type.NullableLogicalInstance.isNullable),
        Type.NullableLogicalInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableNoneInstance.kind, Type.NullableNoneInstance.isNullable),
        Type.NullableNoneInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableNullInstance.kind, Type.NullableNullInstance.isNullable),
        Type.NullableNullInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableNumberInstance.kind, Type.NullableNumberInstance.isNullable),
        Type.NullableNumberInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableRecordInstance.kind, Type.NullableRecordInstance.isNullable),
        Type.NullableRecordInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableTableInstance.kind, Type.NullableTableInstance.isNullable),
        Type.NullableTableInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableTextInstance.kind, Type.NullableTextInstance.isNullable),
        Type.NullableTextInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableTypeInstance.kind, Type.NullableTypeInstance.isNullable),
        Type.NullableTypeInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableActionInstance.kind, Type.NullableActionInstance.isNullable),
        Type.NullableActionInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableTimeInstance.kind, Type.NullableTimeInstance.isNullable),
        Type.NullableTimeInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableNotApplicableInstance.kind, Type.NullableNotApplicableInstance.isNullable),
        Type.NullableNotApplicableInstance,
    ],
    [
        primitiveTypeMapKey(Type.NullableUnknownInstance.kind, Type.NullableUnknownInstance.isNullable),
        Type.NullableUnknownInstance,
    ],
]);

export function primitiveTypeMapKey(typeKind: Type.TypeKind, isNullable: boolean): string {
    return `${typeKind},${isNullable}`;
}

function inspectAstParameter(node: Ast.TParameter): Type.FunctionParameter {
    let isNullable: boolean;
    let maybeType: Type.TypeKind | undefined;

    const maybeParameterType: Ast.TParameterType | undefined = node.maybeParameterType;
    if (maybeParameterType !== undefined) {
        const parameterType: Ast.TParameterType = maybeParameterType;

        switch (parameterType.kind) {
            case Ast.NodeKind.AsNullablePrimitiveType: {
                const simplified: AstUtils.SimplifiedType = AstUtils.simplifyAsNullablePrimitiveType(parameterType);
                isNullable = simplified.isNullable;
                maybeType = typeKindFromPrimitiveTypeConstantKind(simplified.primitiveTypeConstantKind);
                break;
            }

            case Ast.NodeKind.AsType: {
                const simplified: AstUtils.SimplifiedType = AstUtils.simplifyType(parameterType.paired);
                isNullable = simplified.isNullable;
                maybeType = typeKindFromPrimitiveTypeConstantKind(simplified.primitiveTypeConstantKind);
                break;
            }

            default:
                throw Assert.isNever(parameterType);
        }
    } else {
        isNullable = true;
        maybeType = undefined;
    }

    return {
        isNullable,
        isOptional: node.maybeOptionalConstant !== undefined,
        maybeType,
    };
}

function inspectContextParameter(
    nodeIdMapCollection: NodeIdMap.Collection,
    parameter: ParseContext.Node,
): Type.FunctionParameter | undefined {
    let isOptional: boolean;
    let isNullable: boolean;
    let maybeType: Type.TypeKind | undefined;

    const maybeName: Ast.TNode | undefined = NodeIdMapUtils.maybeAstChildByAttributeIndex(
        nodeIdMapCollection,
        parameter.id,
        1,
        [Ast.NodeKind.Identifier],
    );
    if (maybeName === undefined) {
        return undefined;
    }

    const maybeOptional: Ast.TNode | undefined = NodeIdMapUtils.maybeAstChildByAttributeIndex(
        nodeIdMapCollection,
        parameter.id,
        0,
        [Ast.NodeKind.Constant],
    );
    isOptional = maybeOptional !== undefined;

    const maybeParameterType: Ast.TNode | undefined = NodeIdMapUtils.maybeAstChildByAttributeIndex(
        nodeIdMapCollection,
        parameter.id,
        2,
        undefined,
    );
    if (maybeParameterType !== undefined) {
        const parameterType: Ast.AsNullablePrimitiveType = maybeParameterType as Ast.AsNullablePrimitiveType;
        const simplified: AstUtils.SimplifiedType = AstUtils.simplifyAsNullablePrimitiveType(parameterType);
        isNullable = simplified.isNullable;
        maybeType = typeKindFromPrimitiveTypeConstantKind(simplified.primitiveTypeConstantKind);
    } else {
        isNullable = true;
        maybeType = undefined;
    }

    return {
        isOptional,
        isNullable,
        maybeType,
    };
}

function typeNotInArray(collection: ReadonlyArray<Type.TType>, item: Type.TType): boolean {
    return (
        // Fast comparison
        collection.indexOf(item) === -1 &&
        // Deep comparison
        collection.find((type: Type.TType) => equalType(item, type) === undefined) === undefined
    );
}
