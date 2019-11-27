// // Copyright (c) Microsoft Corporation.
// // Licensed under the MIT license.

// import { expect } from "chai";
// import "mocha";
// import { Inspection } from "../..";
// import { ResultKind } from "../../common";
// import { Inspected } from "../../inspection";
// import { KeywordKind } from "../../lexer";
// import { Ast } from "../../parser";
// import { expectParseErrInspection, expectTextWithPosition } from "./common";

// type AbridgedInspection = [Inspected["allowedKeywords"], Inspected["maybeRequiredKeyword"]];

// function expectNodesEqual(triedInspection: Inspection.TriedInspection, expected: AbridgedInspection): void {
//     if (!(triedInspection.kind === ResultKind.Ok)) {
//         throw new Error(`AssertFailed: triedInspection.kind === ResultKind.Ok: ${triedInspection.error.message}`);
//     }
//     const inspection: Inspection.Inspected = triedInspection.value;
//     const actual: AbridgedInspection = [inspection.allowedKeywords, inspection.maybeRequiredKeyword];

//     expect(actual).deep.equal(expected);
// }

// describe(`Inspection`, () => {
//     describe(`abc123 Keyword`, () => {
//         describe(`${Ast.NodeKind.IfExpression}`, () => {
//             it(`if 1 |`, () => {
//                 const [text, position]: [string, Inspection.Position] = expectTextWithPosition(`if 1 |`);
//                 const expected: AbridgedInspection = [[], KeywordKind.Otherwise];
//                 expectNodesEqual(expectParseErrInspection(text, position), expected);
//             });
//         });
//     });
// });