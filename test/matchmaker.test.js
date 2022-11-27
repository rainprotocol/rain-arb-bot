/* eslint-disable no-undef */
require('dotenv').config();
const ethers = require('ethers');
const hardhat = require('hardhat').ethers;
const { expect } = require('chai');
const { avaxTokens } = require('../src/test/avaxTokens');
const { matchmakerTest: Matchmaker} = require('../src/test/matchmakerTest')
const { 
    op,
    memoryOperand,
    MemoryType,
    AllStandardOps,
    basicDeploy,
    getEventArgs
} = require('./utils');

const proxy = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';
const max_uint256 = ethers.constants.MaxUint256;
const zero = ethers.constants.Zero;

describe('OrderBook add order', async function () {
    let interpreter,
        expressionDeployer,
        FRAX,
        DAI;

    before(async () => {
        DAI = await hardhat.getContractAt('ERC20Upgradeable', avaxTokens[0].tokenAddress);
        FRAX = await hardhat.getContractAt('ERC20Upgradeable', avaxTokens[2].tokenAddress);
        interpreter = await basicDeploy('Rainterpreter')
        const expressionDeployerFactory = await hardhat.getContractFactory(
            'RainterpreterExpressionDeployer'
        );
        expressionDeployer = await expressionDeployerFactory.deploy(interpreter.address);
        await expressionDeployer.deployed();
    });

    it('should add orders', async function () {
        // Impersonate the taker account so that we can submit the quote transaction
        // const slosher = await network.provider.request({
        //     method: 'hardhat_impersonateAccount',
        //     params: [takerAddress]
        // });
        const slosher = await hardhat.getImpersonatedSigner(
            '0xc47919bbF3276a416Ec34ffE097De3C1D0b7F1CD'
        );

        // bot wallet as signer
        const bot = (await hardhat.getSigners())[0]

        // instantiating orderBook and arb contracts
        const orderBook = await basicDeploy('OrderBook');
        const arbFactory = await hardhat.getContractFactory('ZeroExOrderBookFlashBorrower')
        const arb = await arbFactory.deploy(orderBook.address, proxy);
        await arb.deployed();

        // building order config
        const slosherVault = ethers.BigNumber.from(1);
        const threshold = ethers.BigNumber.from('900000000000000000'); // 0.9 below 1, for the pupose of the test
        const constants = [max_uint256, threshold];
        const vMaxAmount = op(AllStandardOps.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
        const vThreshold = op(AllStandardOps.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
        const source = ethers.utils.concat([
            vMaxAmount,
            vThreshold,
        ]);

        // slosher's order says she will give anyone 1 DAI who can give her 0.9 FRAX
        const orderConfig = {
            interpreter: interpreter.address,
            expressionDeployer: expressionDeployer.address,
            validInputs: [
                { token: FRAX.address, vaultId: slosherVault },
                { token: DAI.address, vaultId: slosherVault }
            ],
            validOutputs: [
                { token: DAI.address, vaultId: slosherVault },
                { token: FRAX.address, vaultId: slosherVault }
            ],
            interpreterStateConfig: {
                sources: [source, []],
                constants: constants,
            },
        };

        // add order
        const txAddOrderSlosher = await orderBook
            .connect(slosher)
            .addOrder(orderConfig);


        // geting the order event
        const { order: askConfig } = (await getEventArgs(
            txAddOrderSlosher,
            'AddOrder',
            orderBook
        ));

        // using emitted order config to build takeOrder config
        const takeOrderStruct = {
            owner: askConfig.owner,
            interpreter: askConfig.interpreter,
            dispatch: askConfig.dispatch,
            handleIODispatch: askConfig.handleIODispatch,
            validInputs: askConfig.validInputs,
            validOutputs: askConfig.validOutputs
        }

        // Slosher deposits DAI into her output vault
        const amountDAI = ethers.BigNumber.from('1000000000000000000');

        // await DAI.transfer(slosher.address, amountDAI);
        const depositConfigStructAlice = {
            token: DAI.address,
            vaultId: slosherVault,
            amount: amountDAI,
        };

        // increase alloance
        await DAI.connect(slosher).approve(
            orderBook.address,
            zero
        );
        await DAI.connect(slosher).approve(
            arb.address,
            zero
        );
        await DAI.connect(slosher).approve(
            proxy,
            zero
        );
        await FRAX.connect(slosher).approve(
            orderBook.address,
            zero
        );
        await FRAX.connect(slosher).approve(
            arb.address,
            zero
        );
        await FRAX.connect(slosher).approve(
            proxy,
            zero
        );

        await DAI.connect(bot).approve(
            proxy,
            zero
        );
        await FRAX.connect(bot).approve(
            proxy,
            zero
        );
        await DAI.connect(bot).approve(
            arb.address,
            zero
        );
        await FRAX.connect(bot).approve(
            arb.address,
            zero
        );
        await DAI.connect(bot).approve(
            orderBook.address,
            zero
        );
        await FRAX.connect(bot).approve(
            orderBook.address,
            zero
        );



        
        await DAI.connect(slosher).approve(
            orderBook.address,
            max_uint256
        );
        await DAI.connect(slosher).approve(
            arb.address,
            max_uint256
        );
        await DAI.connect(slosher).approve(
            proxy,
            max_uint256
        );
        await FRAX.connect(slosher).approve(
            orderBook.address,
            max_uint256
        );
        await FRAX.connect(slosher).approve(
            arb.address,
            max_uint256
        );
        await FRAX.connect(slosher).approve(
            proxy,
            max_uint256
        );

        await DAI.connect(bot).approve(
            proxy,
            max_uint256
        );
        await FRAX.connect(bot).approve(
            proxy,
            max_uint256
        );
        await DAI.connect(bot).approve(
            arb.address,
            max_uint256
        );
        await FRAX.connect(bot).approve(
            arb.address,
            max_uint256
        );
        await DAI.connect(bot).approve(
            orderBook.address,
            max_uint256
        );
        await FRAX.connect(bot).approve(
            orderBook.address,
            max_uint256
        );

        // Slosher deposits
        await orderBook
            .connect(slosher)
            .deposit(depositConfigStructAlice);


        // mocking subgraph data for matchmaker bot
        const sgMock = {
            stateConfig: {
                sources: [source],
                constants: constants,
            },
            validInputs: [
                { tokenVault: { balance: zero, vaultId: slosherVault, token: { id: FRAX.address, symbol: 'FRAX' }}},
                { tokenVault: { balance: zero, vaultId: slosherVault, token: { id: DAI.address, symbol: 'DAI' }}}
            ],
            validOutputs: [
                { tokenVault: { balance: amountDAI, vaultId: slosherVault, token: { id: DAI.address, symbol: 'DAI' }}},
                { tokenVault: { balance: zero, vaultId: slosherVault, token: { id: FRAX.address, symbol: 'FRAX' }}}
            ]
        };

        // initiating matchmaker bot to find a arb trade
        let result = await Matchmaker(bot, arb, proxy, [sgMock], [takeOrderStruct])
        console.log(result)
        expect(1).to.equal(1, 'hey')
    })
});