// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import { Inspection } from "../../..";
import { isNever, ResultUtils } from "../../../common";
import { Position, ScopeItemByKey, ScopeItemKind } from "../../../inspection";
import { ActiveNode, ActiveNodeUtils } from "../../../inspection/activeNode";
import { Ast } from "../../../language";
import { IParserState, NodeIdMap, ParseError, ParseOk } from "../../../parser";
import { CommonSettings, DefaultSettings, LexSettings, ParseSettings } from "../../../settings";
import { expectDeepEqual, expectParseErr, expectParseOk, expectTextWithPosition } from "../../common";

export type TAbridgedNodeScopeItem =
    | AbridgedEachScopeItem
    | AbridgedKeyValuePairScopeItem
    | AbridgedParameterScopeItem
    | AbridgedSectionMemberScopeItem
    | AbridgedUndefinedScopeItem;

type AbridgedNodeScope = ReadonlyArray<TAbridgedNodeScopeItem>;

interface IAbridgedNodeScopeItem {
    readonly identifier: string;
    readonly recursive: boolean;
    readonly kind: ScopeItemKind;
}

interface AbridgedEachScopeItem extends IAbridgedNodeScopeItem {
    readonly kind: ScopeItemKind.Each;
    readonly eachExpressionNodeId: number;
}

interface AbridgedKeyValuePairScopeItem extends IAbridgedNodeScopeItem {
    readonly kind: ScopeItemKind.KeyValuePair;
    readonly keyNodeId: number;
    readonly maybeValueNodeId: number | undefined;
}

interface AbridgedParameterScopeItem extends IAbridgedNodeScopeItem {
    readonly kind: ScopeItemKind.Parameter;
    readonly nameNodeId: number;
    readonly isNullable: boolean;
    readonly isOptional: boolean;
    readonly maybeType: Ast.PrimitiveTypeConstantKind | undefined;
}

interface AbridgedSectionMemberScopeItem extends IAbridgedNodeScopeItem {
    readonly kind: ScopeItemKind.SectionMember;
    readonly keyNodeId: number;
}

interface AbridgedUndefinedScopeItem extends IAbridgedNodeScopeItem {
    readonly kind: ScopeItemKind.Undefined;
    readonly nodeId: number;
}

function abridgedScopeItemFrom(identifier: string, scopeItem: Inspection.TScopeItem): TAbridgedNodeScopeItem {
    switch (scopeItem.kind) {
        case ScopeItemKind.Each:
            return {
                identifier,
                recursive: scopeItem.recursive,
                kind: scopeItem.kind,
                eachExpressionNodeId: scopeItem.eachExpression.node.id,
            };

        case ScopeItemKind.KeyValuePair:
            return {
                identifier,
                recursive: scopeItem.recursive,
                kind: scopeItem.kind,
                keyNodeId: scopeItem.key.id,
                maybeValueNodeId: scopeItem.maybeValue !== undefined ? scopeItem.maybeValue.node.id : undefined,
            };

        case ScopeItemKind.Parameter:
            return {
                identifier,
                recursive: scopeItem.recursive,
                kind: scopeItem.kind,
                nameNodeId: scopeItem.name.id,
                isNullable: scopeItem.isNullable,
                isOptional: scopeItem.isOptional,
                maybeType: scopeItem.maybeType,
            };

        case ScopeItemKind.SectionMember:
            return {
                identifier,
                recursive: scopeItem.recursive,
                kind: scopeItem.kind,
                keyNodeId: scopeItem.key.id,
            };

        case ScopeItemKind.Undefined:
            return {
                identifier,
                recursive: scopeItem.recursive,
                kind: scopeItem.kind,
                nodeId: scopeItem.xorNode.node.id,
            };

        default:
            throw isNever(scopeItem);
    }
}

function actualScopeFactoryFn(scopeItemByKey: ScopeItemByKey): ReadonlyArray<TAbridgedNodeScopeItem> {
    const result: TAbridgedNodeScopeItem[] = [];

    for (const [identifier, scopeItem] of scopeItemByKey.entries()) {
        result.push(abridgedScopeItemFrom(identifier, scopeItem));
    }

    return result;
}

function actualParameterFactoryFn(scopeItemByKey: ScopeItemByKey): ReadonlyArray<AbridgedParameterScopeItem> {
    const result: AbridgedParameterScopeItem[] = [];

    for (const [identifier, scopeItem] of scopeItemByKey.entries()) {
        const abridged: TAbridgedNodeScopeItem = abridgedScopeItemFrom(identifier, scopeItem);
        if (abridged.kind === ScopeItemKind.Parameter) {
            result.push(abridged);
        }
    }

    return result;
}

function expectScopeForNodeOk(
    settings: CommonSettings,
    nodeIdMapCollection: NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    position: Position,
): ScopeItemByKey {
    const maybeActiveNode: ActiveNode | undefined = ActiveNodeUtils.maybeActiveNode(
        nodeIdMapCollection,
        leafNodeIds,
        position,
    );
    if (maybeActiveNode === undefined) {
        return new Map();
    }
    const activeNode: ActiveNode = maybeActiveNode;

    const triedScopeInspection: Inspection.TriedScopeForRoot = Inspection.tryScopeForRoot(
        settings,
        nodeIdMapCollection,
        leafNodeIds,
        activeNode.ancestry,
        undefined,
    );
    if (!ResultUtils.isOk(triedScopeInspection)) {
        throw new Error(`AssertFailed: ResultUtils.isOk(triedScopeInspection): ${triedScopeInspection.error.message}`);
    }
    return triedScopeInspection.value;
}

export function expectParseOkScopeOk<S extends IParserState = IParserState>(
    settings: LexSettings & ParseSettings<S>,
    text: string,
    position: Position,
): ScopeItemByKey {
    const parseOk: ParseOk<S> = expectParseOk(settings, text);
    return expectScopeForNodeOk(settings, parseOk.nodeIdMapCollection, parseOk.leafNodeIds, position);
}

export function expectParseErrScopeOk<S extends IParserState = IParserState>(
    settings: LexSettings & ParseSettings<S>,
    text: string,
    position: Position,
): ScopeItemByKey {
    const parseError: ParseError.ParseError<S> = expectParseErr(settings, text);
    return expectScopeForNodeOk(
        settings,
        parseError.state.contextState.nodeIdMapCollection,
        parseError.state.contextState.leafNodeIds,
        position,
    );
}

describe(`subset Inspection - Scope - Identifier`, () => {
    describe(`Scope`, () => {
        describe(`${Ast.NodeKind.EachExpression} (Ast)`, () => {
            it(`|each 1`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`|each 1`);
                const expected: ReadonlyArray<TAbridgedNodeScopeItem> = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`each| 1`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`each| 1`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`each |1`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`each |1`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "_",
                        recursive: false,
                        kind: ScopeItemKind.Each,
                        eachExpressionNodeId: 1,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`each 1|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`each 1|`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "_",
                        recursive: false,
                        kind: ScopeItemKind.Each,
                        eachExpressionNodeId: 1,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`each each 1|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`each each 1|`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "_",
                        recursive: false,
                        kind: ScopeItemKind.Each,
                        eachExpressionNodeId: 3,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.EachExpression} (ParserContext)`, () => {
            it(`each|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`each|`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`each |`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`each |`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "_",
                        recursive: false,
                        kind: ScopeItemKind.Each,
                        eachExpressionNodeId: 1,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.FunctionExpression} (Ast)`, () => {
            it(`|(x) => z`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`|(x) => z`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`(x|, y) => z`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`(x|, y) => z`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`(x, y)| => z`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`(x, y)| => z`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`(x, y) => z|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`(x, y) => z|`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.Parameter,
                        recursive: false,
                        nameNodeId: 7,
                        isNullable: true,
                        isOptional: false,
                        maybeType: undefined,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.Parameter,
                        recursive: false,
                        nameNodeId: 11,
                        isNullable: true,
                        isOptional: false,
                        maybeType: undefined,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.FunctionExpression} (ParserContext)`, () => {
            it(`|(x) =>`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`|(x) =>`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`(x|, y) =>`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`(x|, y) =>`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`(x, y)| =>`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`(x, y)| =>`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`(x, y) =>|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`(x, y) =>|`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.Parameter,
                        recursive: false,
                        nameNodeId: 7,
                        isNullable: true,
                        isOptional: false,
                        maybeType: undefined,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.Parameter,
                        recursive: false,
                        nameNodeId: 11,
                        isNullable: true,
                        isOptional: false,
                        maybeType: undefined,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.IdentifierExpression} (Ast)`, () => {
            it(`let x = 1, y = x in 1|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `let x = 1, y = x in 1|`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 13,
                        maybeValueNodeId: 16,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.RecordExpression} (Ast)`, () => {
            it(`|[a=1]`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`|[a=1]`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[|a=1]`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[|a=1]`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=1|]`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=1|]`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 7,
                        maybeValueNodeId: 10,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=1, b=2|]`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=1, b=2|]`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 7,
                        maybeValueNodeId: 10,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 14,
                        maybeValueNodeId: 17,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=1, b=2|, c=3]`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=1, b=2|, c=3]`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 7,
                        maybeValueNodeId: 10,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 14,
                        maybeValueNodeId: 17,
                    },
                    {
                        identifier: "c",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 21,
                        maybeValueNodeId: 24,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=1]|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=1]|`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=[|b=1]]`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=[|b=1]]`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 7,
                        maybeValueNodeId: 10,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.RecordExpression} (ParserContext)`, () => {
            it(`|[a=1`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`|[a=1`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[|a=1`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[|a=1`);
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=|1`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=|1`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 7,
                        maybeValueNodeId: 9,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=1|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=1|`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 7,
                        maybeValueNodeId: 9,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=1, b=|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=1, b=|`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 7,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 13,
                        maybeValueNodeId: 15,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=1, b=2|, c=3`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=1, b=2|, c=3`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 7,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 13,
                        maybeValueNodeId: 15,
                    },
                    {
                        identifier: "c",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 19,
                        maybeValueNodeId: 21,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=[|b=1`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=[|b=1`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 7,
                        maybeValueNodeId: 9,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`[a=[b=|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`[a=[b=|`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 7,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 14,
                        maybeValueNodeId: 16,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.Section} (Ast)`, () => {
            it(`s|ection foo; x = 1; y = 2;`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `s|ection foo; x = 1; y = 2;`,
                );
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`section foo; x = 1|; y = 2;`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `section foo; x = 1|; y = 2;`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.SectionMember,
                        recursive: true,
                        keyNodeId: 8,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.SectionMember,
                        recursive: false,
                        keyNodeId: 15,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`section foo; x = 1; y = 2|;`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `section foo; x = 1; y = 2|;`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.SectionMember,
                        recursive: false,
                        keyNodeId: 8,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.SectionMember,
                        recursive: true,
                        keyNodeId: 15,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`section foo; x = 1; y = 2;|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `section foo; x = 1; y = 2;|`,
                );
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`section foo; x = 1; y = 2; z = let a = 1 in |b;`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `section foo; x = 1; y = 2; z = let a = 1 in |b;`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.SectionMember,
                        recursive: false,
                        keyNodeId: 8,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.SectionMember,
                        recursive: false,
                        keyNodeId: 15,
                    },
                    {
                        identifier: "z",
                        kind: ScopeItemKind.SectionMember,
                        recursive: true,
                        keyNodeId: 22,
                    },
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 29,
                        maybeValueNodeId: 32,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.SectionMember} (ParserContext)`, () => {
            it(`s|ection foo; x = 1; y = 2`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `s|ection foo; x = 1; y = 2`,
                );
                const expected: AbridgedNodeScope = [];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`section foo; x = 1|; y = 2`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `section foo; x = 1|; y = 2`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.SectionMember,
                        recursive: true,
                        keyNodeId: 8,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.SectionMember,
                        recursive: false,
                        keyNodeId: 15,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`section foo; x = 1; y = 2|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `section foo; x = 1; y = 2|`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.SectionMember,
                        recursive: false,
                        keyNodeId: 8,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.SectionMember,
                        recursive: true,
                        keyNodeId: 15,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`section foo; x = 1; y = () => 10|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `section foo; x = 1; y = () => 10|`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.SectionMember,
                        recursive: false,
                        keyNodeId: 8,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.SectionMember,
                        recursive: true,
                        keyNodeId: 15,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.LetExpression} (Ast)`, () => {
            it(`let a = 1 in |x`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`let a = 1 in |x`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let a = 1 in x|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`let a = 1 in x|`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let a = |1 in x`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`let a = |1 in x`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let a = 1, b = 2 in x|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `let a = 1, b = 2 in x|`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 13,
                        maybeValueNodeId: 16,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let a = 1|, b = 2 in x`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `let a = 1|, b = 2 in x`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 13,
                        maybeValueNodeId: 16,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`(p1, p2) => let a = 1, b = 2, c = 3| in c`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `(p1, p2) => let a = 1, b = 2, c = 3| in c`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "p1",
                        kind: ScopeItemKind.Parameter,
                        recursive: false,
                        nameNodeId: 7,
                        isNullable: true,
                        isOptional: false,
                        maybeType: undefined,
                    },
                    {
                        identifier: "p2",
                        kind: ScopeItemKind.Parameter,
                        recursive: false,
                        nameNodeId: 11,
                        isNullable: true,
                        isOptional: false,
                        maybeType: undefined,
                    },
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 19,
                        maybeValueNodeId: 22,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 26,
                        maybeValueNodeId: 29,
                    },
                    {
                        identifier: "c",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 33,
                        maybeValueNodeId: 36,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let eggs = let ham = 0 in 1, foo = 2, bar = 3 in 4|`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `let eggs = let ham = 0 in 1, foo = 2, bar = 3 in 4|`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "eggs",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 6,
                        maybeValueNodeId: 8,
                    },
                    {
                        identifier: "foo",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 23,
                        maybeValueNodeId: 26,
                    },
                    {
                        identifier: "bar",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 30,
                        maybeValueNodeId: 33,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let eggs = let ham = 0 in |1, foo = 2, bar = 3 in 4`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `let eggs = let ham = 0 in |1, foo = 2, bar = 3 in 4`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "eggs",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 6,
                        maybeValueNodeId: 8,
                    },
                    {
                        identifier: "foo",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 23,
                        maybeValueNodeId: 26,
                    },
                    {
                        identifier: "bar",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 30,
                        maybeValueNodeId: 33,
                    },
                    {
                        identifier: "ham",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 13,
                        maybeValueNodeId: 16,
                    },
                ];
                expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });

        describe(`${Ast.NodeKind.LetExpression} (ParserContext)`, () => {
            it(`let a = 1 in |`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`let a = 1 in |`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let a = 1, b = 2 in |`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`let a = 1, b = 2 in |`);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 13,
                        maybeValueNodeId: 16,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let a = 1|, b = 2 in`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`let a = 1|, b = 2 in `);
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "a",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "b",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 13,
                        maybeValueNodeId: 16,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let x = (let y = 1 in z|) in`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `let x = (let y = 1 in z|) in`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: true,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                    {
                        identifier: "y",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 16,
                        maybeValueNodeId: 19,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });

            it(`let x = (let y = 1 in z) in |`, () => {
                const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                    `let x = (let y = 1 in z) in |`,
                );
                const expected: AbridgedNodeScope = [
                    {
                        identifier: "x",
                        kind: ScopeItemKind.KeyValuePair,
                        recursive: false,
                        keyNodeId: 6,
                        maybeValueNodeId: 9,
                    },
                ];
                expectDeepEqual(expectParseErrScopeOk(DefaultSettings, text, position), expected, actualScopeFactoryFn);
            });
        });
    });

    describe(`Parameter`, () => {
        it(`(a, b as number, c as nullable function, optional d, optional e as table) => 1|`, () => {
            const [text, position]: [string, Inspection.Position] = expectTextWithPosition(
                `(a, b as number, c as nullable function, optional d, optional e as table) => 1|`,
            );
            const expected: ReadonlyArray<AbridgedParameterScopeItem> = [
                {
                    identifier: "a",
                    kind: ScopeItemKind.Parameter,
                    recursive: false,
                    nameNodeId: 7,
                    isNullable: true,
                    isOptional: false,
                    maybeType: undefined,
                },
                {
                    identifier: "b",
                    kind: ScopeItemKind.Parameter,
                    recursive: false,
                    nameNodeId: 11,
                    isNullable: false,
                    isOptional: false,
                    maybeType: Ast.PrimitiveTypeConstantKind.Number,
                },
                {
                    identifier: "c",
                    kind: ScopeItemKind.Parameter,
                    recursive: false,
                    nameNodeId: 19,
                    isNullable: true,
                    isOptional: false,
                    maybeType: Ast.PrimitiveTypeConstantKind.Function,
                },
                {
                    identifier: "d",
                    kind: ScopeItemKind.Parameter,
                    recursive: false,
                    nameNodeId: 30,
                    isNullable: true,
                    isOptional: true,
                    maybeType: undefined,
                },
                {
                    identifier: "e",
                    kind: ScopeItemKind.Parameter,
                    recursive: false,
                    nameNodeId: 35,
                    isNullable: false,
                    isOptional: true,
                    maybeType: Ast.PrimitiveTypeConstantKind.Table,
                },
            ];
            expectDeepEqual(expectParseOkScopeOk(DefaultSettings, text, position), expected, actualParameterFactoryFn);
        });
    });
});
