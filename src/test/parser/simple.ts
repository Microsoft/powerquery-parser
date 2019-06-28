// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { expect } from "chai";
import "mocha";
import { Option, ResultKind, Traverse } from "../../common";
import { LexAndParseOk, TriedLexAndParse, tryLexAndParse } from "../../jobs";
import { Ast } from "../../parser";

type AbridgedNode = [Ast.NodeKind, Option<number>];

interface CollectAbridgeNodeState extends Traverse.IState<AbridgedNode[]> {}

interface NthNodeOfKindState extends Traverse.IState<Option<Ast.TNode>> {
    readonly nodeKind: Ast.NodeKind;
    readonly nthRequired: number;
    nthCounter: number;
}

function expectLexAndParseOk(text: string): LexAndParseOk {
    const triedLexAndParse: TriedLexAndParse = tryLexAndParse(text);
    if (!(triedLexAndParse.kind === ResultKind.Ok)) {
        throw new Error(`AssertFailed: triedLexAndParse.kind === ResultKind.Ok: ${triedLexAndParse.error.message}`);
    }
    return triedLexAndParse.value;
}

function collectNodeKindsFromAst(text: string): ReadonlyArray<Ast.NodeKind> {
    const lexAndParseOk: LexAndParseOk = expectLexAndParseOk(text);
    const triedTraverse: Traverse.TriedTraverse<Ast.NodeKind[]> = Traverse.tryTraverseAst<
        CollectAbridgeNodeState,
        Ast.NodeKind[]
    >(
        lexAndParseOk.ast,
        lexAndParseOk.nodeIdMapCollection,
        {
            result: [],
        },
        Traverse.VisitNodeStrategy.BreadthFirst,
        collectAbridgeNodeVisit,
        Traverse.expectExpandAllAstChildren,
        undefined,
    );

    if (!(triedTraverse.kind === ResultKind.Ok)) {
        throw new Error(`AssertFailed: triedTraverse.kind === ResultKind.Ok: ${triedTraverse.error.message}`);
    }

    return triedTraverse.value;
}

function collectAbridgeNodeFromAst(text: string): ReadonlyArray<AbridgedNode> {
    const lexAndParseOk: LexAndParseOk = expectLexAndParseOk(text);
    const triedTraverse: Traverse.TriedTraverse<AbridgedNode[]> = Traverse.tryTraverseAst<
        CollectAbridgeNodeState,
        AbridgedNode[]
    >(
        lexAndParseOk.ast,
        lexAndParseOk.nodeIdMapCollection,
        {
            result: [],
        },
        Traverse.VisitNodeStrategy.BreadthFirst,
        collectAbridgeNodeVisit,
        Traverse.expectExpandAllAstChildren,
        undefined,
    );

    if (!(triedTraverse.kind === ResultKind.Ok)) {
        throw new Error(`AssertFailed: triedTraverse.kind === ResultKind.Ok: ${triedTraverse.error.message}`);
    }

    return triedTraverse.value;
}

function expectNthNodeOfKind<T>(text: string, nodeKind: Ast.NodeKind, nthRequired: number): T & Ast.TNode {
    const lexAndParseOk: LexAndParseOk = expectLexAndParseOk(text);
    const triedTraverse: Traverse.TriedTraverse<Option<Ast.TNode>> = Traverse.tryTraverseAst<
        NthNodeOfKindState,
        Option<Ast.TNode>
    >(
        lexAndParseOk.ast,
        lexAndParseOk.nodeIdMapCollection,
        {
            result: undefined,
            nodeKind,
            nthCounter: 0,
            nthRequired,
        },
        Traverse.VisitNodeStrategy.BreadthFirst,
        nthNodeVisit,
        Traverse.expectExpandAllAstChildren,
        nthNodeEarlyExit,
    );

    if (!(triedTraverse.kind === ResultKind.Ok)) {
        throw new Error(`AssertFailed: triedTraverse.kind === ResultKind.Ok: ${triedTraverse.error.message}`);
    }
    const maybeAstNode: Option<Ast.TNode> = triedTraverse.value;
    if (!(maybeAstNode !== undefined)) {
        throw new Error(`AssertFailed: maybeAstNode !== undefined`);
    }
    const astNode: Ast.TNode = maybeAstNode;

    return astNode as T & Ast.TNode;
}

function collectAbridgeNodeVisit(node: Ast.TNode, state: CollectAbridgeNodeState): void {
    state.result.push([node.kind, node.maybeAttributeIndex]);
}

function nthNodeVisit(node: Ast.TNode, state: NthNodeOfKindState): void {
    if (node.kind === state.nodeKind) {
        state.nthCounter += 1;
        if (state.nthCounter === state.nthRequired) {
            state.result = node;
        }
    }
}

function nthNodeEarlyExit(_: Ast.TNode, state: NthNodeOfKindState): boolean {
    return state.nthCounter === state.nthRequired;
}

function expectNodeKinds(text: string, expected: ReadonlyArray<Ast.NodeKind>): void {
    const actualNodeKinds: ReadonlyArray<Ast.NodeKind> = collectNodeKindsFromAst(text);
    expect(actualNodeKinds).deep.equal(expected);
}

function expectAbridgeNodes(text: string, expected: ReadonlyArray<AbridgedNode>): void {
    const actual: ReadonlyArray<AbridgedNode> = collectAbridgeNodeFromAst(text);
    expect(actual).deep.equal(expected, JSON.stringify(actual));
}

describe("Parser.AbridgedNode", () => {
    it(`${Ast.NodeKind.ArithmeticExpression} ${Ast.ArithmeticOperator.Addition}`, () => {
        const text: string = `1 + 2`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ArithmeticExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.ArithmeticOperator.Addition);
    });

    it(`${Ast.NodeKind.ArithmeticExpression} ${Ast.ArithmeticOperator.And}`, () => {
        const text: string = `1 & 2`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ArithmeticExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.ArithmeticOperator.And);
    });

    it(`${Ast.NodeKind.ArithmeticExpression} ${Ast.ArithmeticOperator.Division}`, () => {
        const text: string = `1 / 2`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ArithmeticExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.ArithmeticOperator.Division);
    });

    it(`${Ast.NodeKind.ArithmeticExpression} ${Ast.ArithmeticOperator.Multiplication}`, () => {
        const text: string = `1 * 2`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ArithmeticExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.ArithmeticOperator.Multiplication);
    });

    it(`${Ast.NodeKind.ArithmeticExpression} ${Ast.ArithmeticOperator.Subtraction}`, () => {
        const text: string = `1 - 2`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ArithmeticExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.ArithmeticOperator.Subtraction);
    });

    it(`${Ast.NodeKind.ArithmeticExpression} with multiple ${Ast.NodeKind.UnaryExpressionHelper}`, () => {
        const text: string = `1 + 2 + 3 + 4`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ArithmeticExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.AsExpression, () => {
        const text: string = `1 as number`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.AsExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.AsNullablePrimitiveType, () => {
        const text: string = `1 as nullable number`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.AsExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.NullablePrimitiveType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.AsType, () => {
        const text: string = `type function (x as number) as number`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.TypePrimaryType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.FunctionType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.ParameterList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.Parameter,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.AsType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.AsType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    // Ast.NodeKind.Constant covered by many

    // Ast.NodeKind.Csv covered by many

    it(Ast.NodeKind.EachExpression, () => {
        const text: string = `each 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.EachExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.EqualityExpression} ${Ast.EqualityOperator.EqualTo}`, () => {
        const text: string = `1 = 2`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.EqualityExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.EqualityOperator.EqualTo);
    });

    it(`${Ast.NodeKind.EqualityExpression} ${Ast.EqualityOperator.NotEqualTo}`, () => {
        const text: string = `1 <> 2`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.EqualityExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.EqualityOperator.NotEqualTo);
    });

    it(`${Ast.NodeKind.ErrorHandlingExpression} otherwise`, () => {
        const text: string = `try 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ErrorHandlingExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.ErrorHandlingExpression} otherwise`, () => {
        const text: string = `try 1 otherwise 2`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ErrorHandlingExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.OtherwiseExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.ErrorRaisingExpression, () => {
        const text: string = `error 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ErrorRaisingExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.FieldProjection, () => {
        const text: string = `x[[y]]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.RecursivePrimaryExpression,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.FieldProjection,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSelector,
            Ast.NodeKind.Constant,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FieldProjection} multiple`, () => {
        const text: string = `x[[y], [z]]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.RecursivePrimaryExpression,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.FieldProjection,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSelector,
            Ast.NodeKind.Constant,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSelector,
            Ast.NodeKind.Constant,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FieldProjection} optional`, () => {
        const text: string = `x[[y]]?`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.RecursivePrimaryExpression,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.FieldProjection,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSelector,
            Ast.NodeKind.Constant,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.FieldSelector, () => {
        const text: string = `[x]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.FieldSelector,
            Ast.NodeKind.Constant,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FieldSelector} optional`, () => {
        const text: string = `[x]?`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.FieldSelector,
            Ast.NodeKind.Constant,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.FieldSpecification, () => {
        const text: string = `type [x]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.TypePrimaryType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.RecordType,
            Ast.NodeKind.FieldSpecificationList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSpecification,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FieldSpecification} optional`, () => {
        const text: string = `type [optional x]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.TypePrimaryType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.RecordType,
            Ast.NodeKind.FieldSpecificationList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSpecification,
            Ast.NodeKind.Constant,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FieldSpecification} FieldTypeSpecification`, () => {
        const text: string = `type [x = number]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.TypePrimaryType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.RecordType,
            Ast.NodeKind.FieldSpecificationList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSpecification,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.FieldTypeSpecification,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.FieldSpecificationList, () => {
        const text: string = `type [x]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.TypePrimaryType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.RecordType,
            Ast.NodeKind.FieldSpecificationList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSpecification,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FieldSpecificationList}`, () => {
        const text: string = `type [x, ...]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.TypePrimaryType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.RecordType,
            Ast.NodeKind.FieldSpecificationList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.FieldSpecification,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    // Ast.NodeKind.FieldTypeSpecification covered by FieldSpecification

    it(Ast.NodeKind.FunctionExpression, () => {
        const text: string = `() => 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.FunctionExpression,
            Ast.NodeKind.ParameterList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FunctionExpression} ParameterList`, () => {
        const text: string = `(x) => 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.FunctionExpression,
            Ast.NodeKind.ParameterList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.Parameter,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FunctionExpression} multiple ParameterList`, () => {
        const text: string = `(x, y, z) => 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.FunctionExpression,
            Ast.NodeKind.ParameterList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.Parameter,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Csv,
            Ast.NodeKind.Parameter,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Csv,
            Ast.NodeKind.Parameter,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FunctionExpression} ParameterList with optional`, () => {
        const text: string = `(optional x) => 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.FunctionExpression,
            Ast.NodeKind.ParameterList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.Parameter,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.FunctionExpression} ParameterList with AsNullablePrimitiveType`, () => {
        const text: string = `(x as nullable text) => 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.FunctionExpression,
            Ast.NodeKind.ParameterList,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.Parameter,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.AsNullablePrimitiveType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.NullablePrimitiveType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    // Ast.NodeKind.FieldTypeSpecification covered by AsType

    it(Ast.NodeKind.GeneralizedIdentifier, () => {
        const text: string = `[foo bar]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.FieldSelector,
            Ast.NodeKind.Constant,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.GeneralizedIdentifierPairedAnyLiteral, () => {
        const text: string = `[x=1] section;`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.Section,
            Ast.NodeKind.RecordLiteral,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.GeneralizedIdentifierPairedAnyLiteral,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.SectionMemberArray,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.GeneralizedIdentifierPairedExpression, () => {
        const text: string = `[x=1]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.RecordExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.GeneralizedIdentifierPairedExpression,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    // Ast.NodeKind.Identifier covered by many

    it(Ast.NodeKind.IdentifierExpression, () => {
        const text: string = `@foo`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Identifier,
        ];
        expectNodeKinds(text, expected);
    });

    // Ast.NodeKind.IdentifierExpressionPairedExpression covered by LetExpression

    it(Ast.NodeKind.IdentifierPairedExpression, () => {
        const text: string = `section; x = 1;`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.Section,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.SectionMemberArray,
            Ast.NodeKind.SectionMember,
            Ast.NodeKind.IdentifierPairedExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.IfExpression, () => {
        const text: string = `if x then x else x`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.IfExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.InvokeExpression, () => {
        const text: string = `foo()`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.RecursivePrimaryExpression,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.InvokeExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.IsExpression, () => {
        const text: string = `1 is number`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.IsExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.ItemAccessExpression, () => {
        const text: string = `x{1}`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.RecursivePrimaryExpression,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.ItemAccessExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.ItemAccessExpression} optional`, () => {
        const text: string = `x{1}?`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.RecursivePrimaryExpression,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.ItemAccessExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.LetExpression, () => {
        const text: string = `let x = 1 in x`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.LetExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.IdentifierPairedExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.ListExpression, () => {
        const text: string = `{1, 2}`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ListExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Csv,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.ListExpression} empty`, () => {
        const text: string = `{}`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ListExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.ListLiteral, () => {
        const text: string = `[foo = {1}] section;`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.Section,
            Ast.NodeKind.RecordLiteral,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.GeneralizedIdentifierPairedAnyLiteral,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.ListLiteral,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.SectionMemberArray,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.ListLiteral} empty`, () => {
        const text: string = `[foo = {}] section;`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.Section,
            Ast.NodeKind.RecordLiteral,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.GeneralizedIdentifierPairedAnyLiteral,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.ListLiteral,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
            Ast.NodeKind.SectionMemberArray,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.ListType, () => {
        const text: string = `type {number}`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.TypePrimaryType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.ListType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LiteralExpression} ${Ast.LiteralKind.Logical} true`, () => {
        const text: string = `true`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.LiteralExpression];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LiteralExpression} ${Ast.LiteralKind.Logical} false`, () => {
        const text: string = `false`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.LiteralExpression];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LiteralExpression} ${Ast.LiteralKind.Numeric} decimal`, () => {
        const text: string = `1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.LiteralExpression];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LiteralExpression} ${Ast.LiteralKind.Numeric} hex`, () => {
        const text: string = `0x1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.LiteralExpression];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LiteralExpression} ${Ast.LiteralKind.Numeric} float`, () => {
        const text: string = `1.1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.LiteralExpression];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LiteralExpression} ${Ast.LiteralKind.Str}`, () => {
        const text: string = `""`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.LiteralExpression];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LiteralExpression} ${Ast.LiteralKind.Str} double quote escape`, () => {
        const text: string = `""""`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.LiteralExpression];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LiteralExpression} ${Ast.LiteralKind.Null}`, () => {
        const text: string = `null`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.LiteralExpression];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LogicalExpression} and`, () => {
        const text: string = `true and true`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.LogicalExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.LogicalExpression} or`, () => {
        const text: string = `true or true`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.LogicalExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.UnaryExpressionHelper,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.MetadataExpression, () => {
        const text: string = `1 meta 1`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.MetadataExpression,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.NotImplementedExpression, () => {
        const text: string = `...`;
        const expected: ReadonlyArray<Ast.NodeKind> = [Ast.NodeKind.NotImplementedExpression, Ast.NodeKind.Constant];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.NullablePrimitiveType, () => {
        const text: string = `x is nullable number`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.IsExpression,
            Ast.NodeKind.IdentifierExpression,
            Ast.NodeKind.Identifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.NullablePrimitiveType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(Ast.NodeKind.NullableType, () => {
        const text: string = `type nullable number`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.TypePrimaryType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.NullableType,
            Ast.NodeKind.Constant,
            Ast.NodeKind.PrimitiveType,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    // Ast.NodeKind.OtherwiseExpression covered by `${Ast.NodeKind.ErrorHandlingExpression} otherwise`

    // Ast.NodeKind.Parameter covered by many

    // Ast.NodeKind.ParameterList covered by many

    it(Ast.NodeKind.ParenthesizedExpression, () => {
        const text: string = `(1)`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.ParenthesizedExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    // Ast.NodeKind.PrimitiveType covered by many

    it(`${Ast.NodeKind.RecordExpression}`, () => {
        const text: string = `[x=1]`;
        const expected: ReadonlyArray<Ast.NodeKind> = [
            Ast.NodeKind.RecordExpression,
            Ast.NodeKind.Constant,
            Ast.NodeKind.CsvArray,
            Ast.NodeKind.Csv,
            Ast.NodeKind.GeneralizedIdentifierPairedExpression,
            Ast.NodeKind.GeneralizedIdentifier,
            Ast.NodeKind.Constant,
            Ast.NodeKind.LiteralExpression,
            Ast.NodeKind.Constant,
        ];
        expectNodeKinds(text, expected);
    });

    it(`${Ast.NodeKind.RecordExpression} empty`, () => {
        const text: string = `[]`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.RecordExpression, undefined],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.CsvArray, 1],
            [Ast.NodeKind.Constant, 2],
        ];
        expectAbridgeNodes(text, expected);
    });

    // Ast.NodeKind.RecordLiteral covered by many

    it(`${Ast.NodeKind.RecordType}`, () => {
        const text: string = `type [x]`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.TypePrimaryType, undefined],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.RecordType, 1],
            [Ast.NodeKind.FieldSpecificationList, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.CsvArray, 1],
            [Ast.NodeKind.Csv, 0],
            [Ast.NodeKind.FieldSpecification, 0],
            [Ast.NodeKind.GeneralizedIdentifier, 1],
            [Ast.NodeKind.Constant, 2],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.RecordType} open record marker`, () => {
        const text: string = `type [x, ...]`;
        const expected: ReadonlyArray<AbridgedNode> = [
            // [Ast.NodeKind.TypePrimaryType, undefined],
            // [Ast.NodeKind.Constant, 0],
            // [Ast.NodeKind.RecordType, 1],
            // [Ast.NodeKind.FieldSpecificationList, 0],
            // [Ast.NodeKind.Constant, 0],
            // [Ast.NodeKind.CsvArray, 1],
            // [Ast.NodeKind.Csv, 0],
            // [Ast.NodeKind.FieldSpecification, 0],
            // [Ast.NodeKind.GeneralizedIdentifier, 1],
            // [Ast.NodeKind.Constant, 4],
            // [Ast.NodeKind.Constant, 1],
            // [Ast.NodeKind.Constant, 2],
        ];
        expectAbridgeNodes(text, expected);
    });

    // Ast.NodeKind.RecursivePrimaryExpression covered by many

    it(`${Ast.NodeKind.RelationalExpression} ${Ast.RelationalOperator.GreaterThan}`, () => {
        const text: string = `1 > 2`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.RelationalExpression, undefined],
            [Ast.NodeKind.LiteralExpression, 0],
            [Ast.NodeKind.UnaryExpressionHelperArray, 1],
            [Ast.NodeKind.UnaryExpressionHelper, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.LiteralExpression, 1],
        ];
        expectAbridgeNodes(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.RelationalOperator.GreaterThan);
    });

    it(`${Ast.NodeKind.RelationalExpression} ${Ast.RelationalOperator.GreaterThanEqualTo}`, () => {
        const text: string = `1 >= 2`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.RelationalExpression, undefined],
            [Ast.NodeKind.LiteralExpression, 0],
            [Ast.NodeKind.UnaryExpressionHelperArray, 1],
            [Ast.NodeKind.UnaryExpressionHelper, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.LiteralExpression, 1],
        ];
        expectAbridgeNodes(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.RelationalOperator.GreaterThanEqualTo);
    });

    it(`${Ast.NodeKind.RelationalExpression} ${Ast.RelationalOperator.LessThan}`, () => {
        const text: string = `1 < 2`;
        const expected: ReadonlyArray<AbridgedNode> = [];
        expectAbridgeNodes(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.RelationalOperator.LessThan);
    });

    it(`${Ast.NodeKind.RelationalExpression} ${Ast.RelationalOperator.LessThanEqualTo}`, () => {
        const text: string = `1 <= 2`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.RelationalExpression, undefined],
            [Ast.NodeKind.LiteralExpression, 0],
            [Ast.NodeKind.UnaryExpressionHelperArray, 1],
            [Ast.NodeKind.UnaryExpressionHelper, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.LiteralExpression, 1],
        ];
        expectAbridgeNodes(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.RelationalOperator.LessThanEqualTo);
    });

    it(`${Ast.NodeKind.Section}`, () => {
        const text: string = `section;`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.Section, undefined],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMemberArray, 4],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.Section} attributes`, () => {
        const text: string = `[] section;`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.Section, undefined],
            [Ast.NodeKind.RecordLiteral, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.CsvArray, 1],
            [Ast.NodeKind.Constant, 2],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMemberArray, 4],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.Section} name`, () => {
        const text: string = `section foo;`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.Section, undefined],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.Identifier, 2],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMemberArray, 4],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.Section} member`, () => {
        const text: string = `section; x = 1;`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.Section, undefined],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMemberArray, 4],
            [Ast.NodeKind.SectionMember, 0],
            [Ast.NodeKind.IdentifierPairedExpression, 2],
            [Ast.NodeKind.Identifier, 0],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.LiteralExpression, 2],
            [Ast.NodeKind.Constant, 3],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.Section} members`, () => {
        const text: string = `section; x = 1; y = 2;`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.Section, undefined],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMemberArray, 4],
            [Ast.NodeKind.SectionMember, 0],
            [Ast.NodeKind.IdentifierPairedExpression, 2],
            [Ast.NodeKind.Identifier, 0],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.LiteralExpression, 2],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMember, 1],
            [Ast.NodeKind.IdentifierPairedExpression, 2],
            [Ast.NodeKind.Identifier, 0],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.LiteralExpression, 2],
            [Ast.NodeKind.Constant, 3],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.SectionMember}`, () => {
        const text: string = `section; x = 1;`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.Section, undefined],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMemberArray, 4],
            [Ast.NodeKind.SectionMember, 0],
            [Ast.NodeKind.IdentifierPairedExpression, 2],
            [Ast.NodeKind.Identifier, 0],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.LiteralExpression, 2],
            [Ast.NodeKind.Constant, 3],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.SectionMember} attributes`, () => {
        const text: string = `section; [] x = 1;`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.Section, undefined],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMemberArray, 4],
            [Ast.NodeKind.SectionMember, 0],
            [Ast.NodeKind.RecordLiteral, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.CsvArray, 1],
            [Ast.NodeKind.Constant, 2],
            [Ast.NodeKind.IdentifierPairedExpression, 2],
            [Ast.NodeKind.Identifier, 0],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.LiteralExpression, 2],
            [Ast.NodeKind.Constant, 3],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.SectionMember} shared`, () => {
        const text: string = `section; shared x = 1;`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.Section, undefined],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.Constant, 3],
            [Ast.NodeKind.SectionMemberArray, 4],
            [Ast.NodeKind.SectionMember, 0],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.IdentifierPairedExpression, 2],
            [Ast.NodeKind.Identifier, 0],
            [Ast.NodeKind.Constant, 1],
            [Ast.NodeKind.LiteralExpression, 2],
            [Ast.NodeKind.Constant, 3],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.TableType} - type table [x]`, () => {
        const text: string = `type table [x]`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.TypePrimaryType, undefined],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.TableType, 1],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.FieldSpecificationList, 1],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.CsvArray, 1],
            [Ast.NodeKind.Csv, 0],
            [Ast.NodeKind.FieldSpecification, 0],
            [Ast.NodeKind.GeneralizedIdentifier, 1],
            [Ast.NodeKind.Constant, 2],
        ];
        expectAbridgeNodes(text, expected);
    });

    it(`${Ast.NodeKind.TableType} - type table (x)`, () => {
        const text: string = `type table (x)`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.TypePrimaryType, undefined],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.TableType, 1],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.ParenthesizedExpression, 1],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.IdentifierExpression, 1],
            [Ast.NodeKind.Identifier, 1],
            [Ast.NodeKind.Constant, 2],
        ];
        expectAbridgeNodes(text, expected);
    });

    // Ast.NodeKind.TypePrimaryType covered by many

    it(`${Ast.NodeKind.UnaryExpression} ${Ast.UnaryOperator.Negative}`, () => {
        const text: string = `-1`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.UnaryExpression, undefined],
            [Ast.NodeKind.UnaryExpressionHelperArray, 0],
            [Ast.NodeKind.UnaryExpressionHelper, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.LiteralExpression, 1],
        ];
        expectAbridgeNodes(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.UnaryOperator.Negative);
    });

    it(`${Ast.NodeKind.UnaryExpression} ${Ast.UnaryOperator.Not}`, () => {
        const text: string = `not 1`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.UnaryExpression, undefined],
            [Ast.NodeKind.UnaryExpressionHelperArray, 0],
            [Ast.NodeKind.UnaryExpressionHelper, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.LiteralExpression, 1],
        ];
        expectAbridgeNodes(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.UnaryOperator.Not);
    });

    it(`${Ast.NodeKind.UnaryExpression} ${Ast.UnaryOperator.Positive}`, () => {
        const text: string = `+1`;
        const expected: ReadonlyArray<AbridgedNode> = [
            [Ast.NodeKind.UnaryExpression, undefined],
            [Ast.NodeKind.UnaryExpressionHelperArray, 0],
            [Ast.NodeKind.UnaryExpressionHelper, 0],
            [Ast.NodeKind.Constant, 0],
            [Ast.NodeKind.LiteralExpression, 1],
        ];
        expectAbridgeNodes(text, expected);

        const operatorNode: Ast.Constant = expectNthNodeOfKind<Ast.Constant>(text, Ast.NodeKind.Constant, 1);
        expect(operatorNode.literal).to.equal(Ast.UnaryOperator.Positive);
    });
});
