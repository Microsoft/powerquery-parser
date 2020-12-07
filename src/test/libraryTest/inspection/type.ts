// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { expect } from "chai";
import "mocha";
import {
    Assert,
    CommonSettings,
    DefaultSettings,
    Inspection,
    Language,
    Parser,
    Task,
} from "../../../powerquery-parser";
import { TestAssertUtils } from "../../testUtils";

function assertParseOkNodeTypeEqual(text: string, expected: Language.Type.TType): void {
    const lexParseOk: Task.LexParseOk = TestAssertUtils.assertGetLexParseOk(DefaultSettings, text);
    const actual: Language.Type.TType = assertGetParseNodeOk(
        DefaultSettings,
        lexParseOk.state.contextState.nodeIdMapCollection,
        lexParseOk.state.contextState.leafNodeIds,
        Parser.XorNodeUtils.astFactory(lexParseOk.root),
    );

    expect(actual).deep.equal(expected);
}

function assertParseErrNodeTypeEqual(text: string, expected: Language.Type.TType): void {
    const parseErr: Parser.ParseError.ParseError<Parser.IParseState> = TestAssertUtils.assertGetParseErr(
        DefaultSettings,
        text,
    );
    const root: Parser.ParseContext.Node = Assert.asDefined(parseErr.state.contextState.maybeRoot);

    const actual: Language.Type.TType = assertGetParseNodeOk(
        DefaultSettings,
        parseErr.state.contextState.nodeIdMapCollection,
        parseErr.state.contextState.leafNodeIds,
        Parser.XorNodeUtils.contextFactory(root),
    );

    expect(actual).deep.equal(expected);
}

function assertGetParseNodeOk(
    settings: CommonSettings,
    nodeIdMapCollection: Parser.NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    xorNode: Parser.TXorNode,
): Language.Type.TType {
    const triedType: Inspection.TriedType = Inspection.tryType(
        settings,
        nodeIdMapCollection,
        leafNodeIds,
        xorNode.node.id,
    );
    Assert.isOk(triedType);

    return triedType.value;
}

function assertParseOkScopeTypeEqual(textWithPipe: string, expected: Inspection.ScopeTypeByKey): void {
    const [textWithoutPipe, position]: [string, Inspection.Position] = TestAssertUtils.assertGetTextWithPosition(
        textWithPipe,
    );
    const lexParseOk: Task.LexParseOk = TestAssertUtils.assertGetLexParseOk(DefaultSettings, textWithoutPipe);
    const nodeIdMapCollection: Parser.NodeIdMap.Collection = lexParseOk.state.contextState.nodeIdMapCollection;
    const leafNodeIds: ReadonlyArray<number> = lexParseOk.state.contextState.leafNodeIds;

    const actual: Inspection.ScopeTypeByKey = assertGetParseOkScopeTypeOk(
        DefaultSettings,
        nodeIdMapCollection,
        leafNodeIds,
        position,
    );

    expect(actual).deep.equal(expected);
}

function assertGetParseOkScopeTypeOk(
    settings: CommonSettings,
    nodeIdMapCollection: Parser.NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    position: Inspection.Position,
): Inspection.ScopeTypeByKey {
    const activeNodeLeaf: Parser.TXorNode = Inspection.ActiveNodeUtils.assertGetLeaf(
        Inspection.ActiveNodeUtils.assertActiveNode(nodeIdMapCollection, leafNodeIds, position),
    );
    const triedScopeType: Inspection.TriedScopeType = Inspection.tryScopeType(
        settings,
        nodeIdMapCollection,
        leafNodeIds,
        activeNodeLeaf.node.id,
    );
    Assert.isOk(triedScopeType);

    return triedScopeType.value;
}

describe(`Inspection - Scope - Type`, () => {
    describe("BinOpExpression", () => {
        it(`1 + 1`, () => {
            const expression: string = "1 + 1";
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`true and false`, () => {
            const expression: string = `true and false`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`"hello" & "world"`, () => {
            const expression: string = `"hello" & "world"`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Text,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`true + 1`, () => {
            const expression: string = `true + 1`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.None,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.AsNullablePrimitiveType}`, () => {
        it(`(foo as number, bar as nullable number) => foo + bar|`, () => {
            const expression: string = `(foo as number, bar as nullable number) => foo + bar|`;
            const expected: Inspection.ScopeTypeByKey = new Map<string, Language.Type.TType>([
                ["foo", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                ["bar", Language.TypeUtils.primitiveTypeFactory(true, Language.Type.TypeKind.Number)],
            ]);
            assertParseOkScopeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.AsExpression}`, () => {
        it(`1 as number`, () => {
            const expression: string = `1 as number`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`1 as text`, () => {
            const expression: string = `1 as text`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Text,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`1 as any`, () => {
            const expression: string = `1 as any`;
            const expected: Language.Type.TType = Language.Type.AnyInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.ErrorHandlingExpression}`, () => {
        it(`try 1`, () => {
            const expression: string = `try 1`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Any,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.AnyUnion,
                isNullable: false,
                unionedTypePairs: [
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Record),
                ],
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`try 1 otherwise false`, () => {
            const expression: string = `try 1 otherwise false`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Any,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.AnyUnion,
                isNullable: false,
                unionedTypePairs: [
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Logical),
                ],
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.ErrorRaisingExpression}`, () => {
        it(`error 1`, () => {
            const expression: string = `error 1`;
            const expected: Language.Type.TType = Language.Type.AnyInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.FieldProjection}`, () => {
        it(`[a=1][[a]]`, () => {
            const expression: string = `[a=1][[a]]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["a", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                ]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[a=1][[b]]`, () => {
            const expression: string = `[a=1][[b]]`;
            const expected: Language.Type.TType = Language.Type.NoneInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[a=1][[b]]?`, () => {
            const expression: string = `[a=1][[b]]?`;
            const expected: Language.Type.TType = Language.Type.NullInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`(1 as record)[[a]]`, () => {
            const expression: string = `let x = (1 as record) in x[[a]]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([["a", Language.Type.AnyInstance]]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`(1 as record)[[a]]?`, () => {
            const expression: string = `let x = (1 as record) in x[[a]]?`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([["a", Language.Type.AnyInstance]]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.FieldSelector}`, () => {
        it(`[a=1][a]`, () => {
            const expression: string = `[a=1][a]`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[a=1][b]`, () => {
            const expression: string = `[a=1][b]`;
            const expected: Language.Type.TType = Language.Type.NoneInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[a=1][b]?`, () => {
            const expression: string = `[a=1][b]?`;
            const expected: Language.Type.TType = Language.Type.NullInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`let x = (1 as record) in x[a]`, () => {
            const expression: string = `let x = (1 as record) in x[a]`;
            const expected: Language.Type.TType = Language.Type.AnyInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`let x = (1 as record) in x[a]?`, () => {
            const expression: string = `let x = (1 as record) in x[a]?`;
            const expected: Language.Type.TType = Language.Type.AnyInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.FunctionExpression}`, () => {
        it(`() => 1`, () => {
            const expression: string = `() => 1`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Function,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedFunction,
                isNullable: false,
                parameters: [],
                returnType: Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        // Test AnyUnion return
        it(`() => if true then 1 else ""`, () => {
            const expression: string = `() => if true then 1 else ""`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Function,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedFunction,
                isNullable: false,
                parameters: [],
                returnType: Language.TypeUtils.anyUnionFactory([
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Text),
                ]),
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`(a, b as number, c as nullable number, optional d) => 1`, () => {
            const expression: string = `(a, b as number, c as nullable number, optional d) => 1`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Function,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedFunction,
                isNullable: false,
                parameters: [
                    {
                        nameLiteral: "a",
                        isNullable: true,
                        isOptional: false,
                        maybeType: undefined,
                    },
                    {
                        nameLiteral: "b",
                        isNullable: false,
                        isOptional: false,
                        maybeType: Language.Type.TypeKind.Number,
                    },
                    {
                        nameLiteral: "c",
                        isNullable: true,
                        isOptional: false,
                        maybeType: Language.Type.TypeKind.Number,
                    },
                    {
                        nameLiteral: "d",
                        isNullable: true,
                        isOptional: true,
                        maybeType: undefined,
                    },
                ],
                returnType: Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.FunctionType}`, () => {
        it(`type function`, () => {
            const expression: string = `type function`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Function,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`type function () as text`, () => {
            const expression: string = `type function () as text`;
            const expected: Language.Type.FunctionType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.FunctionType,
                isNullable: false,
                parameters: [],
                returnType: Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Text),
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`type function (foo as number, bar as nullable text, optional baz as date) as text`, () => {
            const expression: string = `type function (foo as number, bar as nullable text, optional baz as date) as text`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.FunctionType,
                isNullable: false,
                parameters: [
                    {
                        nameLiteral: "foo",
                        isNullable: false,
                        isOptional: false,
                        maybeType: Language.Type.TypeKind.Number,
                    },
                    {
                        nameLiteral: "bar",
                        isNullable: true,
                        isOptional: false,
                        maybeType: Language.Type.TypeKind.Text,
                    },
                    {
                        nameLiteral: "baz",
                        isNullable: false,
                        isOptional: true,
                        maybeType: Language.Type.TypeKind.Date,
                    },
                ],
                returnType: Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Text),
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.IdentifierExpression}`, () => {
        it(`let x = true in x`, () => {
            const expression: string = "let x = true in x";
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`let x = 1 in x`, () => {
            const expression: string = "let x = 1 in x";
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.IfExpression}`, () => {
        it(`if true then true else false`, () => {
            const expression: string = `if true then true else false`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`if true then 1 else false`, () => {
            const expression: string = `if true then 1 else false`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Any,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.AnyUnion,
                isNullable: false,
                unionedTypePairs: [
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Logical),
                ],
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`if if true then true else false then 1 else 0`, () => {
            const expression: string = `if if true then true else false then 1 else ""`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Any,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.AnyUnion,
                isNullable: false,
                unionedTypePairs: [
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Text),
                ],
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`if`, () => {
            const expression: string = `if`;
            const expected: Language.Type.TType = Language.Type.UnknownInstance;
            assertParseErrNodeTypeEqual(expression, expected);
        });

        it(`if "a"`, () => {
            const expression: string = `if "a"`;
            const expected: Language.Type.TType = Language.Type.NoneInstance;
            assertParseErrNodeTypeEqual(expression, expected);
        });

        it(`if true or "a"`, () => {
            const expression: string = `if true or "a"`;
            const expected: Language.Type.TType = Language.Type.NoneInstance;
            assertParseErrNodeTypeEqual(expression, expected);
        });

        it(`if 1 as any then "a" else "b"`, () => {
            const expression: string = `if 1 as any then "a" else "b"`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Text,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`if true then 1`, () => {
            const expression: string = `if true then 1`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Any,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.AnyUnion,
                isNullable: false,
                unionedTypePairs: [
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Unknown),
                ],
            };
            assertParseErrNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.IsExpression}`, () => {
        it(`1 is text`, () => {
            const expression: string = `1 is text`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.IsNullablePrimitiveType}`, () => {
        it(`1 is nullable text`, () => {
            const expression: string = `1 is nullable text`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.ListExpression}`, () => {
        it(`{1}`, () => {
            const expression: string = `{1}`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.List,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedList,
                isNullable: false,
                elements: [Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`{1, ""}`, () => {
            const expression: string = `{1, ""}`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.List,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedList,
                isNullable: false,
                elements: [
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
                    Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Text),
                ],
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.ListType}`, () => {
        it(`type { number }`, () => {
            const expression: string = `type { number }`;
            const expected: Language.Type.ListType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.ListType,
                isNullable: false,
                itemType: Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number),
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.LiteralExpression}`, () => {
        it(`true`, () => {
            const expression: string = "true";
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`false`, () => {
            const expression: string = "false";
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`1`, () => {
            const expression: string = "1";
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`null`, () => {
            const expression: string = "null";
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                true,
                Language.Type.TypeKind.Null,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`{}`, () => {
            const expression: string = `{}`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.List,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedList,
                isNullable: false,
                elements: [],
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
        it(`[]`, () => {
            const expression: string = `[]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>(),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.NullableType}`, () => {
        it(`type nullable number`, () => {
            const expression: string = "type nullable number";
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                true,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.NullCoalescingExpression}`, () => {
        it(`1 ?? 2`, () => {
            const expression: string = `1 ?? 2`;
            const expected: Language.Type.TType = Language.Type.NumberInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`1 ?? ""`, () => {
            const expression: string = `1 ?? ""`;
            const expected: Language.Type.TType = Language.TypeUtils.anyUnionFactory([
                Language.Type.NumberInstance,
                Language.Type.TextInstance,
            ]);
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`1 ?? (1 + "")`, () => {
            const expression: string = `1 ?? (1 + "")`;
            const expected: Language.Type.TType = Language.Type.NoneInstance;
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.RecordExpression}`, () => {
        it(`[foo=1] & [bar=2]`, () => {
            const expression: string = `[foo=1] & [bar=2]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["foo", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                    ["bar", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                ]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[] & [bar=2]`, () => {
            const expression: string = `[] & [bar=2]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["bar", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                ]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[foo=1] & []`, () => {
            const expression: string = `[foo=1] & []`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["foo", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                ]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[foo=1] & [foo=""]`, () => {
            const expression: string = `[foo=1] & [foo=""]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["foo", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Text)],
                ]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[] as record & [foo=1]`, () => {
            const expression: string = `[] as record & [foo=1]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["foo", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                ]),
                isOpen: true,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[foo=1] & [] as record`, () => {
            const expression: string = `[foo=1] & [] as record`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Record,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["foo", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                ]),
                isOpen: true,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`[] as record & [] as record`, () => {
            const expression: string = `[] as record & [] as record`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Record,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.RecordType}`, () => {
        it(`type [foo]`, () => {
            const expression: string = `type [foo]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.RecordType,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([["foo", Language.Type.AnyInstance]]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`type [foo, ...]`, () => {
            const expression: string = `type [foo, ...]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.RecordType,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([["foo", Language.Type.AnyInstance]]),
                isOpen: true,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`type [foo = number, bar = nullable text]`, () => {
            const expression: string = `type [foo = number, bar = nullable text]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.RecordType,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["foo", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                    ["bar", Language.TypeUtils.primitiveTypeFactory(true, Language.Type.TypeKind.Text)],
                ]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.RecursivePrimaryExpression}`, () => {
        describe(`any is allowed`, () => {
            it(`${Language.Ast.NodeKind.InvokeExpression}`, () => {
                const expression: string = `let x = (_ as any) in x()`;
                const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                    false,
                    Language.Type.TypeKind.Any,
                );
                assertParseOkNodeTypeEqual(expression, expected);
            });

            it(`${Language.Ast.NodeKind.ItemAccessExpression}`, () => {
                const expression: string = `let x = (_ as any) in x{0}`;
                const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                    false,
                    Language.Type.TypeKind.Any,
                );
                assertParseOkNodeTypeEqual(expression, expected);
            });

            describe(`${Language.Ast.NodeKind.FieldSelector}`, () => {
                it("[a=1][a]", () => {
                    const expression: string = `[a=1][a]`;
                    const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                        false,
                        Language.Type.TypeKind.Number,
                    );
                    assertParseOkNodeTypeEqual(expression, expected);
                });

                it("[a=1][b]", () => {
                    const expression: string = `[a=1][b]`;
                    const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                        false,
                        Language.Type.TypeKind.None,
                    );
                    assertParseOkNodeTypeEqual(expression, expected);
                });

                it("a[b]?", () => {
                    const expression: string = `[a=1][b]?`;
                    const expected: Language.Type.TType = Language.Type.NullInstance;
                    assertParseOkNodeTypeEqual(expression, expected);
                });
            });

            it(`${Language.Ast.NodeKind.FieldProjection}`, () => {
                const expression: string = `let x = (_ as any) in x[[foo]]`;
                const expected: Language.Type.TType = {
                    kind: Language.Type.TypeKind.Any,
                    maybeExtendedKind: Language.Type.ExtendedTypeKind.AnyUnion,
                    isNullable: false,
                    unionedTypePairs: [
                        {
                            kind: Language.Type.TypeKind.Record,
                            maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedRecord,
                            isNullable: false,
                            fields: new Map<string, Language.Type.TType>([["foo", Language.Type.AnyInstance]]),
                            isOpen: false,
                        },
                        {
                            kind: Language.Type.TypeKind.Table,
                            maybeExtendedKind: Language.Type.ExtendedTypeKind.DefinedTable,
                            isNullable: false,
                            fields: new Map<string, Language.Type.TType>([["foo", Language.Type.AnyInstance]]),
                            isOpen: false,
                        },
                    ],
                };
                assertParseOkNodeTypeEqual(expression, expected);
            });

            it(`${Language.Ast.NodeKind.FieldSelector}`, () => {
                const expression: string = `[a=1][a]`;
                const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                    false,
                    Language.Type.TypeKind.Number,
                );
                assertParseOkNodeTypeEqual(expression, expected);
            });
        });

        it(`let x = () as function => () as number => 1 in x()()`, () => {
            const expression: string = `let x = () as function => () as number => 1 in x()()`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.TableType}`, () => {
        it(`type table [foo]`, () => {
            const expression: string = `type table [foo]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.TableType,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([["foo", Language.Type.AnyInstance]]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`type table [foo]`, () => {
            const expression: string = `type table [foo]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.TableType,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([["foo", Language.Type.AnyInstance]]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`type table [foo = number, bar = nullable text]`, () => {
            const expression: string = `type table [foo = number, bar = nullable text]`;
            const expected: Language.Type.TType = {
                kind: Language.Type.TypeKind.Type,
                maybeExtendedKind: Language.Type.ExtendedTypeKind.TableType,
                isNullable: false,
                fields: new Map<string, Language.Type.TType>([
                    ["foo", Language.TypeUtils.primitiveTypeFactory(false, Language.Type.TypeKind.Number)],
                    ["bar", Language.TypeUtils.primitiveTypeFactory(true, Language.Type.TypeKind.Text)],
                ]),
                isOpen: false,
            };
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });

    describe(`${Language.Ast.NodeKind.UnaryExpression}`, () => {
        it(`+1`, () => {
            const expression: string = `+1`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`-1`, () => {
            const expression: string = `-1`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Number,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`not true`, () => {
            const expression: string = `not true`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`not false`, () => {
            const expression: string = `not false`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.Logical,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`not 1`, () => {
            const expression: string = `not 1`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.None,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });

        it(`+true`, () => {
            const expression: string = `+true`;
            const expected: Language.Type.TType = Language.TypeUtils.primitiveTypeFactory(
                false,
                Language.Type.TypeKind.None,
            );
            assertParseOkNodeTypeEqual(expression, expected);
        });
    });
});
