// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CommonError, isNever, Result, ResultKind } from "../common";
import { Ast, AstUtils, NodeIdMap, NodeIdMapIter, NodeIdMapUtils, TXorNode, XorNodeKind } from "../parser";
import { InspectionSettings } from "../settings";
import { Type, TypeUtils } from "../type";
import { InspectedScope, ScopeItemKind, TScopeItem } from "./scope";

export type ScopeTypeMap = Map<string, Type.TType>;

export interface InspectedType {
    readonly scopeTypeMap: ScopeTypeMap;
}

export type TriedType = Result<InspectedType, CommonError.CommonError>;

export function tryInspectScopeType(
    settings: InspectionSettings,
    inspectedScope: InspectedScope,
    nodeIdMapCollection: NodeIdMap.Collection,
): Result<InspectedType, CommonError.CommonError> {
    // The return object. Only stores [scope key, TType] pairs.
    const scopeTypeMap: ScopeTypeMap = new Map();
    // A temporary working set. Stores all [nodeId, TType] pairs evaluated.
    const scopeTypeCacheMap: ScopeTypeCacheMap = new Map();

    try {
        for (const [key, node] of [...inspectedScope.scope.entries()]) {
            scopeTypeMap.set(key, evaluateScopeItem(nodeIdMapCollection, node, scopeTypeCacheMap));
        }
    } catch (err) {
        return {
            kind: ResultKind.Err,
            error: CommonError.ensureCommonError(settings.localizationTemplates, err),
        };
    }

    return {
        kind: ResultKind.Ok,
        value: {
            scopeTypeMap,
        },
    };
}

type ScopeTypeCacheMap = Map<number, Type.TType>;

function evaluateScopeItem(
    nodeIdMapCollection: NodeIdMap.Collection,
    scopeItem: TScopeItem,
    scopeTypeMap: ScopeTypeCacheMap,
): Type.TType {
    switch (scopeItem.kind) {
        case ScopeItemKind.Each:
            return evaluateXorNode(nodeIdMapCollection, scopeTypeMap, scopeItem.each);

        case ScopeItemKind.KeyValuePair:
            return scopeItem.maybeValue === undefined
                ? anyFactory()
                : evaluateXorNode(nodeIdMapCollection, scopeTypeMap, scopeItem.maybeValue);

        case ScopeItemKind.Parameter:
            return scopeItem.maybeType === undefined
                ? anyFactory()
                : {
                      kind: TypeUtils.typeKindFromPrimitiveTypeConstantKind(scopeItem.maybeType),
                      maybeExtendedKind: undefined,
                      isNullable: scopeItem.isNullable,
                  };

        case ScopeItemKind.SectionMember:
            return scopeItem.maybeValue === undefined
                ? anyFactory()
                : evaluateXorNode(nodeIdMapCollection, scopeTypeMap, scopeItem.maybeValue);

        case ScopeItemKind.Undefined:
            return unknownFactory();

        default:
            throw isNever(scopeItem);
    }
}

function evaluateXorNode(
    nodeIdMapCollection: NodeIdMap.Collection,
    scopeTypeMap: ScopeTypeCacheMap,
    xorNode: TXorNode,
): Type.TType {
    const maybeCached: Type.TType | undefined = scopeTypeMap.get(xorNode.node.id);
    if (maybeCached !== undefined) {
        return maybeCached;
    }

    let result: Type.TType;
    switch (xorNode.node.kind) {
        case Ast.NodeKind.LiteralExpression: {
            switch (xorNode.kind) {
                case XorNodeKind.Ast:
                    // We already checked it's a Ast Literal Expression.
                    const literalKind: Ast.LiteralKind = (xorNode.node as Ast.LiteralExpression).literalKind;
                    const typeKind: Exclude<Type.TypeKind, Type.TExtendedTypeKind> = TypeUtils.typeKindFromLiteralKind(
                        literalKind,
                    );
                    result = genericFactory(typeKind, literalKind === Ast.LiteralKind.Null);
                    break;

                case XorNodeKind.Context:
                    result = unknownFactory();
                    break;

                default:
                    throw isNever(xorNode);
            }
            break;
        }

        case Ast.NodeKind.ArithmeticExpression:
        case Ast.NodeKind.EqualityExpression:
        case Ast.NodeKind.LogicalExpression:
        case Ast.NodeKind.RelationalExpression:
            result = evaluateBinOpExpression(nodeIdMapCollection, xorNode, scopeTypeMap);
            break;

        case Ast.NodeKind.AsExpression: {
            result = evaluateByChildAttributeIndex(nodeIdMapCollection, scopeTypeMap, xorNode, 2);
            break;
        }

        case Ast.NodeKind.AsNullablePrimitiveType:
            result = evaluateByChildAttributeIndex(nodeIdMapCollection, scopeTypeMap, xorNode, 1);
            break;

        case Ast.NodeKind.Constant:
            result = evaluateConstant(xorNode);
            break;

        case Ast.NodeKind.Csv:
            result = evaluateByChildAttributeIndex(nodeIdMapCollection, scopeTypeMap, xorNode, 1);
            break;

        case Ast.NodeKind.EachExpression:
            result = evaluateByChildAttributeIndex(nodeIdMapCollection, scopeTypeMap, xorNode, 1);
            break;

        default:
            result = unknownFactory();
    }

    scopeTypeMap.set(xorNode.node.id, result);
    return result;
}

function genericFactory(typeKind: Type.TypeKind, isNullable: boolean): Type.TType {
    return {
        kind: typeKind,
        maybeExtendedKind: undefined,
        isNullable,
    };
}

function anyFactory(): Type.TType {
    return {
        kind: Type.TypeKind.Any,
        maybeExtendedKind: undefined,
        isNullable: true,
    };
}

function anyUnionFactory(unionedTypePairs: ReadonlyArray<Type.TType>): Type.AnyUnion {
    return {
        kind: Type.TypeKind.Any,
        maybeExtendedKind: Type.ExtendedTypeKind.AnyUnion,
        isNullable: unionedTypePairs.find((ttype: Type.TType) => ttype.isNullable === true) !== undefined,
        unionedTypePairs,
    };
}

function unknownFactory(): Type.TType {
    return {
        kind: Type.TypeKind.Unknown,
        maybeExtendedKind: undefined,
        isNullable: false,
    };
}

function noneFactory(): Type.TType {
    return {
        kind: Type.TypeKind.None,
        maybeExtendedKind: undefined,
        isNullable: false,
    };
}

function evaluateByChildAttributeIndex(
    nodeIdMapCollection: NodeIdMap.Collection,
    scopeTypeMap: ScopeTypeCacheMap,
    parentXorNode: TXorNode,
    attributeIndex: number,
): Type.TType {
    const maybeXorNode: TXorNode = NodeIdMapUtils.expectXorChildByAttributeIndex(
        nodeIdMapCollection,
        parentXorNode.node.id,
        attributeIndex,
        undefined,
    );
    return maybeXorNode !== undefined
        ? evaluateXorNode(nodeIdMapCollection, scopeTypeMap, maybeXorNode)
        : unknownFactory();
}

function evaluateBinOpExpression(
    nodeIdMapCollection: NodeIdMap.Collection,
    xorNode: TXorNode,
    scopeTypeMap: ScopeTypeCacheMap,
): Type.TType {
    if (!AstUtils.isTBinOpExpressionKind(xorNode.node.kind)) {
        const details: {} = {
            nodeId: xorNode.node.id,
            nodeKind: xorNode.node.kind,
        };
        throw new CommonError.InvariantError("expected xorNode to be TBinOpExpression", details);
    }

    const parentId: number = xorNode.node.id;
    const children: ReadonlyArray<TXorNode> = NodeIdMapIter.expectXorChildren(nodeIdMapCollection, parentId);

    const maybeLeft: undefined | TXorNode = children[0];
    const maybeOperatorKind: undefined | Ast.TBinOpExpressionOperator =
        children[1] === undefined || children[1].kind === XorNodeKind.Context
            ? undefined
            : (children[1].node as Ast.IConstant<Ast.TBinOpExpressionOperator>).constantKind;
    const maybeRight: undefined | TXorNode = children[2];

    // ''
    if (maybeLeft === undefined) {
        return unknownFactory();
    }
    // '1'
    else if (maybeOperatorKind === undefined) {
        return evaluateXorNode(nodeIdMapCollection, scopeTypeMap, maybeLeft);
    }
    // '1 +'
    else if (maybeRight === undefined || maybeRight.kind === XorNodeKind.Context) {
        const leftType: Type.TType = evaluateXorNode(nodeIdMapCollection, scopeTypeMap, maybeLeft);
        const operatorKind: Ast.TBinOpExpressionOperator = maybeOperatorKind;

        const partialLookupKey: string = binOpExpressionPartialLookupKey(leftType.kind, operatorKind);
        const maybeAllowedTypeKinds: undefined | ReadonlyArray<Type.TypeKind> = BinOpExpressionPartialLookup.get(
            partialLookupKey,
        );
        if (maybeAllowedTypeKinds === undefined) {
            return noneFactory();
        } else if (maybeAllowedTypeKinds.length === 1) {
            return genericFactory(maybeAllowedTypeKinds[0], leftType.isNullable);
        } else {
            const unionedTypePairs: ReadonlyArray<Type.TType> = maybeAllowedTypeKinds.map((kind: Type.TypeKind) => {
                return {
                    kind,
                    maybeExtendedKind: undefined,
                    isNullable: true,
                };
            });
            return anyUnionFactory(unionedTypePairs);
        }
    }
    // '1 + 1'
    else {
        const leftType: Type.TType = evaluateXorNode(nodeIdMapCollection, scopeTypeMap, maybeLeft);
        const operatorKind: Ast.TBinOpExpressionOperator = maybeOperatorKind;
        const rightType: Type.TType = evaluateXorNode(nodeIdMapCollection, scopeTypeMap, maybeRight);

        const key: string = binOpExpressionLookupKey(leftType.kind, operatorKind, rightType.kind);
        const maybeResultTypeKind: undefined | Type.TypeKind = BinOpExpressionLookup.get(key);
        if (maybeResultTypeKind === undefined) {
            return noneFactory();
        }
        const resultTypeKind: Type.TypeKind = maybeResultTypeKind;

        // '[foo = 1] & [bar = 2]'
        if (
            operatorKind === Ast.ArithmeticOperatorKind.And &&
            (resultTypeKind === Type.TypeKind.Record || resultTypeKind === Type.TypeKind.Table)
        ) {
            return evaluateTableOrRecordUnion(leftType, rightType);
        } else {
            return genericFactory(resultTypeKind, leftType.isNullable || rightType.isNullable);
        }
    }
}

function evaluateConstant(xorNode: TXorNode): Type.TType {
    if (xorNode.kind === XorNodeKind.Context) {
        return unknownFactory();
    } else if (xorNode.node.kind !== Ast.NodeKind.Constant) {
        const details: {} = {
            nodeId: xorNode.node.id,
            nodeKind: xorNode.node.kind,
        };
        throw new CommonError.InvariantError(
            `${evaluateConstant.name}: expected xorNode to be of NodeKind.Constant`,
            details,
        );
    } else {
        const constant: Ast.TConstant = xorNode.node;

        switch (constant.constantKind) {
            case Ast.PrimitiveTypeConstantKind.Action:
                return genericFactory(Type.TypeKind.Action, false);
            case Ast.PrimitiveTypeConstantKind.Any:
                return genericFactory(Type.TypeKind.Any, true);
            case Ast.PrimitiveTypeConstantKind.AnyNonNull:
                return genericFactory(Type.TypeKind.AnyNonNull, false);
            case Ast.PrimitiveTypeConstantKind.Binary:
                return genericFactory(Type.TypeKind.Binary, false);
            case Ast.PrimitiveTypeConstantKind.Date:
                return genericFactory(Type.TypeKind.Date, false);
            case Ast.PrimitiveTypeConstantKind.DateTime:
                return genericFactory(Type.TypeKind.DateTime, false);
            case Ast.PrimitiveTypeConstantKind.DateTimeZone:
                return genericFactory(Type.TypeKind.DateTimeZone, false);
            case Ast.PrimitiveTypeConstantKind.Duration:
                return genericFactory(Type.TypeKind.Duration, false);
            case Ast.PrimitiveTypeConstantKind.Function:
                return genericFactory(Type.TypeKind.Function, false);
            case Ast.PrimitiveTypeConstantKind.List:
                return genericFactory(Type.TypeKind.List, false);
            case Ast.PrimitiveTypeConstantKind.Logical:
                return genericFactory(Type.TypeKind.Logical, false);
            case Ast.PrimitiveTypeConstantKind.None:
                return genericFactory(Type.TypeKind.None, false);
            case Ast.PrimitiveTypeConstantKind.Null:
                return genericFactory(Type.TypeKind.Null, true);
            case Ast.PrimitiveTypeConstantKind.Number:
                return genericFactory(Type.TypeKind.Number, false);
            case Ast.PrimitiveTypeConstantKind.Record:
                return genericFactory(Type.TypeKind.Record, false);
            case Ast.PrimitiveTypeConstantKind.Table:
                return genericFactory(Type.TypeKind.Table, false);
            case Ast.PrimitiveTypeConstantKind.Text:
                return genericFactory(Type.TypeKind.Text, false);
            case Ast.PrimitiveTypeConstantKind.Time:
                return genericFactory(Type.TypeKind.Time, false);
            case Ast.PrimitiveTypeConstantKind.Type:
                return genericFactory(Type.TypeKind.Type, false);

            default:
                return unknownFactory();
        }
    }
}

const BinOpExpressionLookup: ReadonlyMap<string, Type.TypeKind> = new Map([
    ...createLookupsForRelational(Type.TypeKind.Null),
    ...createLookupsForEquality(Type.TypeKind.Null),

    ...createLookupsForRelational(Type.TypeKind.Logical),
    ...createLookupsForEquality(Type.TypeKind.Logical),
    ...createLookupsForLogical(Type.TypeKind.Logical),

    ...createLookupsForRelational(Type.TypeKind.Number),
    ...createLookupsForEquality(Type.TypeKind.Number),
    ...createLookupsForArithmetic(Type.TypeKind.Number),

    ...createLookupsForRelational(Type.TypeKind.Time),
    ...createLookupsForEquality(Type.TypeKind.Time),
    ...createLookupsForClockKind(Type.TypeKind.Time),
    [
        binOpExpressionLookupKey(Type.TypeKind.Date, Ast.ArithmeticOperatorKind.And, Type.TypeKind.Time),
        Type.TypeKind.DateTime,
    ],

    ...createLookupsForRelational(Type.TypeKind.Date),
    ...createLookupsForEquality(Type.TypeKind.Date),
    ...createLookupsForClockKind(Type.TypeKind.Date),
    [
        binOpExpressionLookupKey(Type.TypeKind.Date, Ast.ArithmeticOperatorKind.And, Type.TypeKind.Time),
        Type.TypeKind.DateTime,
    ],

    ...createLookupsForRelational(Type.TypeKind.DateTime),
    ...createLookupsForEquality(Type.TypeKind.DateTime),
    ...createLookupsForClockKind(Type.TypeKind.DateTime),

    ...createLookupsForRelational(Type.TypeKind.DateTimeZone),
    ...createLookupsForEquality(Type.TypeKind.DateTimeZone),
    ...createLookupsForClockKind(Type.TypeKind.DateTimeZone),

    ...createLookupsForRelational(Type.TypeKind.Duration),
    ...createLookupsForEquality(Type.TypeKind.Duration),
    [
        binOpExpressionLookupKey(Type.TypeKind.Duration, Ast.ArithmeticOperatorKind.Addition, Type.TypeKind.Duration),
        Type.TypeKind.Duration,
    ],
    [
        binOpExpressionLookupKey(
            Type.TypeKind.Duration,
            Ast.ArithmeticOperatorKind.Subtraction,
            Type.TypeKind.Duration,
        ),
        Type.TypeKind.Duration,
    ],
    [
        binOpExpressionLookupKey(
            Type.TypeKind.Duration,
            Ast.ArithmeticOperatorKind.Multiplication,
            Type.TypeKind.Number,
        ),
        Type.TypeKind.Duration,
    ],
    [
        binOpExpressionLookupKey(
            Type.TypeKind.Number,
            Ast.ArithmeticOperatorKind.Multiplication,
            Type.TypeKind.Duration,
        ),
        Type.TypeKind.Duration,
    ],
    [
        binOpExpressionLookupKey(Type.TypeKind.Duration, Ast.ArithmeticOperatorKind.Division, Type.TypeKind.Number),
        Type.TypeKind.Duration,
    ],

    ...createLookupsForRelational(Type.TypeKind.Text),
    ...createLookupsForEquality(Type.TypeKind.Text),
    [
        binOpExpressionLookupKey(Type.TypeKind.Text, Ast.ArithmeticOperatorKind.And, Type.TypeKind.Text),
        Type.TypeKind.Text,
    ],

    ...createLookupsForRelational(Type.TypeKind.Binary),
    ...createLookupsForEquality(Type.TypeKind.Binary),

    ...createLookupsForEquality(Type.TypeKind.List),
    [
        binOpExpressionLookupKey(Type.TypeKind.List, Ast.ArithmeticOperatorKind.And, Type.TypeKind.List),
        Type.TypeKind.List,
    ],

    ...createLookupsForEquality(Type.TypeKind.Record),
    [
        binOpExpressionLookupKey(Type.TypeKind.Record, Ast.ArithmeticOperatorKind.And, Type.TypeKind.Record),
        Type.TypeKind.Record,
    ],

    ...createLookupsForEquality(Type.TypeKind.Table),
    [
        binOpExpressionLookupKey(Type.TypeKind.Table, Ast.ArithmeticOperatorKind.And, Type.TypeKind.Table),
        Type.TypeKind.Table,
    ],
]);

const binOpExpressionPartialLookup: Map<string, Type.TypeKind[]> = new Map();
for (const key of BinOpExpressionLookup.keys()) {
    const lastDeliminatorIndex: number = key.lastIndexOf(",");
    const partialKey: string = key.slice(0, lastDeliminatorIndex);
    const potentialNewValue: Type.TypeKind = key.slice(lastDeliminatorIndex + 1) as Type.TypeKind;
    const values: Type.TypeKind[] = binOpExpressionPartialLookup.get(partialKey) || [];

    if (values.indexOf(potentialNewValue) === -1) {
        values.push(potentialNewValue);
    }
}
const BinOpExpressionPartialLookup: ReadonlyMap<string, ReadonlyArray<Type.TypeKind>> = binOpExpressionPartialLookup;

const UnaryExpressionLookup: Map<string, Type.TypeKind> = new Map([
    [unaryOpExpressionLookupKey(Ast.UnaryOperatorKind.Not, Type.TypeKind.Logical), Type.TypeKind.Logical],

    [unaryOpExpressionLookupKey(Ast.UnaryOperatorKind.Negative, Type.TypeKind.Number), Type.TypeKind.Number],
    [unaryOpExpressionLookupKey(Ast.UnaryOperatorKind.Positive, Type.TypeKind.Number), Type.TypeKind.Number],
]);

function binOpExpressionPartialLookupKey(
    leftTypeKind: Type.TypeKind,
    operatorKind: Ast.TBinOpExpressionOperator,
): string {
    return `${leftTypeKind},${operatorKind}`;
}

function binOpExpressionLookupKey(
    leftTypeKind: Type.TypeKind,
    operatorKind: Ast.TBinOpExpressionOperator,
    rightTypeKind: Type.TypeKind,
): string {
    return `${leftTypeKind},${operatorKind},${rightTypeKind}`;
}

function unaryOpExpressionLookupKey(operatorKind: Ast.UnaryOperatorKind, typeKind: Type.TypeKind): string {
    return `${operatorKind},${typeKind}`;
}

function createLookupsForRelational(typeKind: Type.TypeKind): ReadonlyArray<[string, Type.TypeKind]> {
    return [
        [binOpExpressionLookupKey(typeKind, Ast.RelationalOperatorKind.GreaterThan, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.RelationalOperatorKind.GreaterThanEqualTo, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.RelationalOperatorKind.LessThan, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.RelationalOperatorKind.LessThanEqualTo, typeKind), typeKind],
    ];
}

function createLookupsForEquality(typeKind: Type.TypeKind): ReadonlyArray<[string, Type.TypeKind]> {
    return [
        [binOpExpressionLookupKey(typeKind, Ast.EqualityOperatorKind.EqualTo, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.EqualityOperatorKind.NotEqualTo, typeKind), typeKind],
    ];
}

// Note: does not include the "and" operator.
function createLookupsForArithmetic(typeKind: Type.TypeKind): ReadonlyArray<[string, Type.TypeKind]> {
    return [
        [binOpExpressionLookupKey(typeKind, Ast.ArithmeticOperatorKind.Addition, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.ArithmeticOperatorKind.Division, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.ArithmeticOperatorKind.Multiplication, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.ArithmeticOperatorKind.Subtraction, typeKind), typeKind],
    ];
}

function createLookupsForLogical(typeKind: Type.TypeKind): ReadonlyArray<[string, Type.TypeKind]> {
    return [
        [binOpExpressionLookupKey(typeKind, Ast.LogicalOperatorKind.And, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.LogicalOperatorKind.Or, typeKind), typeKind],
    ];
}

function createLookupsForClockKind(
    typeKind: Type.TypeKind.Date | Type.TypeKind.DateTime | Type.TypeKind.DateTimeZone | Type.TypeKind.Time,
): ReadonlyArray<[string, Type.TypeKind]> {
    return [
        [binOpExpressionLookupKey(typeKind, Ast.ArithmeticOperatorKind.Addition, Type.TypeKind.Duration), typeKind],
        [binOpExpressionLookupKey(Type.TypeKind.Duration, Ast.ArithmeticOperatorKind.Addition, typeKind), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.ArithmeticOperatorKind.Subtraction, Type.TypeKind.Duration), typeKind],
        [binOpExpressionLookupKey(typeKind, Ast.ArithmeticOperatorKind.Subtraction, typeKind), Type.TypeKind.Duration],
    ];
}

function evaluateTableOrRecordUnion(leftType: Type.TType, rightType: Type.TType): Type.TType {
    if (leftType.kind !== rightType.kind) {
        const details: {} = {
            leftTypeKind: leftType.kind,
            rightTypeKind: rightType.kind,
        };
        throw new CommonError.InvariantError(
            `evaluateTableOrRecordUnion: expected leftType.kind === rightType.kind`,
            details,
        );
    }
    // '[] & []'
    else if (leftType.maybeExtendedKind === undefined && rightType.maybeExtendedKind === undefined) {
        return genericFactory(leftType.kind, leftType.isNullable || rightType.isNullable);
    }
    // '[key=value] & []'
    else if (leftType.maybeExtendedKind !== undefined && rightType.maybeExtendedKind === undefined) {
        return leftType;
    }
    // '[] & [key=value]'
    else if (leftType.maybeExtendedKind === undefined && rightType.maybeExtendedKind !== undefined) {
        return rightType;
    } else {
        throw new Error("TODO");
    }
}
