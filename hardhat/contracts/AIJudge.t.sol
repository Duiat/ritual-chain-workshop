// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AIJudge} from "./AIJudge.sol";

contract AIJudgeTest is Test {
    AIJudge internal judge;

    address internal owner = address(0xA11CE);
    address internal alice = address(0xA71CE);
    address internal bob = address(0xB0B);

    string internal constant ALICE_ANSWER = "Use commit-reveal to hide answers.";
    string internal constant BOB_ANSWER = "Encrypt submissions with Ritual TEE.";
    bytes32 internal aliceSalt = keccak256("alice-salt");
    bytes32 internal bobSalt = keccak256("bob-salt");

    uint256 internal bountyId;
    uint256 internal deadline;

    function setUp() public {
        judge = new AIJudge();
        vm.deal(owner, 10 ether);
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        deadline = block.timestamp + 1 days;
        vm.prank(owner);
        bountyId = judge.createBounty{value: 1 ether}(
            "Privacy bounty",
            "Best answer wins",
            deadline
        );
    }

    function _commit(
        address submitter,
        string memory answer,
        bytes32 salt
    ) internal returns (bytes32 commitment) {
        commitment = judge.computeCommitment(answer, salt, submitter, bountyId);
        vm.prank(submitter);
        judge.submitCommitment(bountyId, commitment);
    }

    function test_computeCommitment_isDeterministic() public view {
        bytes32 first = judge.computeCommitment(
            ALICE_ANSWER,
            aliceSalt,
            alice,
            bountyId
        );
        bytes32 second = judge.computeCommitment(
            ALICE_ANSWER,
            aliceSalt,
            alice,
            bountyId
        );
        assertEq(first, second);
    }

    function test_submitCommitment_beforeDeadline() public {
        bytes32 commitment = _commit(alice, ALICE_ANSWER, aliceSalt);

        (
            address submitter,
            bytes32 storedCommitment,
            string memory answer,
            bool revealed
        ) = judge.getSubmission(bountyId, 0);

        assertEq(submitter, alice);
        assertEq(storedCommitment, commitment);
        assertEq(bytes(answer).length, 0);
        assertFalse(revealed);
    }

    function test_submitCommitment_revertsAfterDeadline() public {
        bytes32 commitment = judge.computeCommitment(
            ALICE_ANSWER,
            aliceSalt,
            alice,
            bountyId
        );

        vm.warp(deadline);
        vm.prank(alice);
        vm.expectRevert("submission phase closed");
        judge.submitCommitment(bountyId, commitment);
    }

    function test_revealAnswer_validReveal() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);

        vm.warp(deadline);

        vm.prank(alice);
        judge.revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);

        (
            ,
            ,
            string memory answer,
            bool revealed
        ) = judge.getSubmission(bountyId, 0);

        assertTrue(revealed);
        assertEq(answer, ALICE_ANSWER);
    }

    function test_revealAnswer_revertsBeforeDeadline() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);

        vm.prank(alice);
        vm.expectRevert("submission phase open");
        judge.revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);
    }

    function test_revealAnswer_revertsWrongSalt() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);

        vm.warp(deadline);

        vm.prank(alice);
        vm.expectRevert("invalid reveal");
        judge.revealAnswer(bountyId, ALICE_ANSWER, keccak256("wrong"));
    }

    function test_revealAnswer_revertsWrongAnswer() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);

        vm.warp(deadline);

        vm.prank(alice);
        vm.expectRevert("invalid reveal");
        judge.revealAnswer(bountyId, "tampered answer", aliceSalt);
    }

    function test_revealAnswer_revertsWrongSubmitter() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);

        vm.warp(deadline);

        vm.prank(bob);
        vm.expectRevert("no commitment to reveal");
        judge.revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);
    }

    function test_revealAnswer_revertsDoubleReveal() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);

        vm.warp(deadline);

        vm.prank(alice);
        judge.revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);

        vm.prank(alice);
        vm.expectRevert("no commitment to reveal");
        judge.revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);
    }

    function test_submitCommitment_updatesExistingUnrevealedCommitment() public {
        bytes32 first = _commit(alice, "first draft", aliceSalt);
        bytes32 second = judge.computeCommitment(
            ALICE_ANSWER,
            aliceSalt,
            alice,
            bountyId
        );

        vm.prank(alice);
        judge.submitCommitment(bountyId, second);

        (, bytes32 storedCommitment, , bool revealed) = judge.getSubmission(
            bountyId,
            0
        );

        assertEq(storedCommitment, second);
        assertNotEq(storedCommitment, first);
        assertFalse(revealed);

        (, , , , , , , uint256 submissionCount, , , ) = judge.getBounty(
            bountyId
        );
        assertEq(submissionCount, 1);
    }

    function test_getSubmission_hidesAnswerUntilRevealed() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);
        _commit(bob, BOB_ANSWER, bobSalt);

        (, , string memory hiddenAlice, bool aliceRevealed) = judge
            .getSubmission(bountyId, 0);
        (, , string memory hiddenBob, bool bobRevealed) = judge.getSubmission(
            bountyId,
            1
        );

        assertEq(bytes(hiddenAlice).length, 0);
        assertEq(bytes(hiddenBob).length, 0);
        assertFalse(aliceRevealed);
        assertFalse(bobRevealed);

        vm.warp(deadline);
        vm.prank(alice);
        judge.revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);

        (, , string memory revealedAlice, bool nowRevealed) = judge
            .getSubmission(bountyId, 0);
        (, , string memory stillHiddenBob, ) = judge.getSubmission(
            bountyId,
            1
        );

        assertTrue(nowRevealed);
        assertEq(revealedAlice, ALICE_ANSWER);
        assertEq(bytes(stillHiddenBob).length, 0);
    }

    function test_judgeAll_revertsWithNoReveals() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);

        vm.warp(deadline);

        vm.prank(owner);
        vm.expectRevert("no revealed submissions");
        judge.judgeAll(bountyId, hex"");
    }

    function test_judgeAll_revertsBeforeDeadline() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);

        vm.warp(deadline);
        vm.prank(alice);
        judge.revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);

        vm.warp(deadline - 1);

        vm.prank(owner);
        vm.expectRevert("submission phase open");
        judge.judgeAll(bountyId, hex"");
    }

    function test_getBounty_tracksRevealedCount() public {
        _commit(alice, ALICE_ANSWER, aliceSalt);
        _commit(bob, BOB_ANSWER, bobSalt);

        (, , , , , , , , uint256 revealedBefore, , ) = judge.getBounty(
            bountyId
        );
        assertEq(revealedBefore, 0);

        vm.warp(deadline);
        vm.prank(alice);
        judge.revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);

        (, , , , , , , , uint256 revealedAfter, , ) = judge.getBounty(
            bountyId
        );
        assertEq(revealedAfter, 1);
    }
}